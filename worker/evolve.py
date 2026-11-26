#!/usr/bin/env python3
"""Darwin evolution on GameForge's make -> play -> review pipeline.

A species is a frozen HTML game version. Every generation:
  make     studios: N DeepSeek Harness (dsh) teams each fork a parent, read its real reviews and change whatever they
           decide (no edit cap), playtesting and looking at their own screenshots as they go
  critic   a harsh vision critic scores novelty / visual / feel / feedback / clarity / depth with fixed anchors
  play     the same isolated runtime and inert JSON key policies as single-candidate improvement,
           with three player personas (newbie / speedrunner / explorer)
  review   blind A/B and B/A comparison against the parent (citations verified)
  society  persona posts grounded in the real trajectories + a deterministic diffusion model
  select   fitness, MAP-Elites archive (challenge x progress) and tournament parents

Only the trusted controller calls models; species never see credentials. Model judgement is a
proxy signal, never a human result. The retained champion must have passed both blind reviews
against its parent (or be the original root).
"""
import hashlib
import json
from pathlib import Path
import random
import shutil
import subprocess
import tempfile
import time
import re
from concurrent.futures import ThreadPoolExecutor
import difflib

from runner import Run, read
from controller import atomic, sha, apply_edits, should_promote, citation_path
from artstats import code_stats, placeholder_art
from standard import RUBRIC, CRITIC_SHAPE, AREAS
import studio

GENES = ['mechanic', 'level', 'pacing', 'feedback', 'difficulty', 'onboarding', 'visual']
PLAYERS = [
    ('newbie', 'Persona 萌新 newbie: first-time player; reads on-screen text, presses Enter to start, tries each control, hesitates and mistimes some jumps'),
    ('speed', 'Persona 速通 speedrunner: knows platformers; starts immediately and heads straight for the goal with long held runs and precise jumps'),
    ('explorer', 'Persona 探索 explorer: probes edges and optional pickups, deliberately fails once and uses R to restart, then pushes forward'),
]
# Behaviour niches tuned to short 24-action probes: most runs reach a small share of a level.
CHALLENGE_BINS = (0.05, 0.25)
PROGRESS_BINS = (0.12, 0.3)
W = {'critic': 0.35, 'review': 0.15, 'social': 0.25, 'progress': 0.10, 'novelty': 0.15}
PERSONAS = json.loads((Path(__file__).parent / 'personas.json').read_text(encoding='utf-8'))


def clamp(value, low=0.0, high=1.0):
    try:
        return max(low, min(high, float(value)))
    except (TypeError, ValueError):
        return low


def bucket(value, bins):
    return sum(1 for edge in bins if value >= edge)


def seed_of(text):
    return int(hashlib.sha256(text.encode()).hexdigest()[:12], 16)


def js_syntax_ok(html):
    """Compile inline scripts with `node --check` (parse only, never executed on the host)."""
    node = shutil.which('node')
    if not node:
        return True, 'node unavailable: syntax not checked'
    scripts = re.findall(r'<script\b([^>]*)>([\s\S]*?)</script\s*>', html, re.I)
    if not scripts:
        return False, 'missing inline script'
    for attrs, body in scripts:
        if re.search(r'\bsrc\s*=', attrs, re.I):
            return False, 'external script not allowed'
        if re.search(r'type\s*=\s*["\']application/json', attrs, re.I):
            continue
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as handle:
            handle.write(body)
        try:
            result = subprocess.run([node, '--check', handle.name], capture_output=True, text=True, timeout=30)
        finally:
            Path(handle.name).unlink(missing_ok=True)
        if result.returncode:
            line = next((l for l in result.stderr.splitlines() if 'Error' in l), result.stderr[-300:])
            return False, 'JavaScript syntax error: ' + line.strip()[:300]
    return True, 'ok'


def apply_edits_tolerant(html, edits):
    """Exact-once edits; a before string that misses only on whitespace may match one unique span."""
    if not isinstance(edits, list) or not edits:
        raise ValueError('Builder must return at least one exact edit')
    for index, edit in enumerate(edits):
        before, after = edit.get('before') if isinstance(edit, dict) else None, edit.get('after') if isinstance(edit, dict) else None
        if not isinstance(before, str) or not before.strip() or not isinstance(after, str):
            raise ValueError(f'Edit {index + 1}: before/after must be non-empty strings')
        count = html.count(before)
        if count == 1:
            html = html.replace(before, after, 1)
            continue
        if count > 1:
            raise ValueError(f'Edit {index + 1}: before matches {count} times; add surrounding context')
        pattern = r'\s+'.join(re.escape(part) for part in before.split())
        spans = [m.span() for m in re.finditer(pattern, html)]
        if len(spans) != 1:
            raise ValueError(f'Edit {index + 1}: before text not found verbatim (starts with {before.strip()[:60]!r})')
        start, end = spans[0]
        html = html[:start] + after + html[end:]
    return html


KEY_ALIASES = {'基因': 'gene', '名称': 'name', '名字': 'name', '物种名': 'name', '拉丁名': 'latin', '学名': 'latin', '假设': 'hypothesis',
               '变更': 'changes', '改动': 'changes', '验收': 'acceptance', '验收标准': 'acceptance'}
GENE_ALIASES = {'机制': 'mechanic', '关卡': 'level', '节奏': 'pacing', '反馈': 'feedback', '难度': 'difficulty', '引导': 'onboarding', '视觉': 'visual'}


def english_keys(plan):
    if not isinstance(plan, dict):
        return {}
    plan = {KEY_ALIASES.get(k, k): v for k, v in plan.items()}
    gene = str(plan.get('gene', '')).strip().lower()
    plan['gene'] = GENE_ALIASES.get(gene, gene)
    return plan


def progress_of(state):
    if not isinstance(state, dict):
        return 0.0
    if state.get('won'):
        return 1.0
    value = state.get('progress')
    if isinstance(value, dict):
        value = value.get('ratio', value.get('value', 0))
    value = clamp(value, 0, 100)
    return value / 100 if value > 1 else value


def health_of(state):
    player = state.get('player') if isinstance(state, dict) else None
    if isinstance(player, dict):
        try:
            return float(player.get('health'))
        except (TypeError, ValueError):
            return None
    return None


class Evolution(Run):
    def setup(self):
        budgets = self.input['budgets']
        self.generations = int(budgets.get('generations', 3))
        self.children = int(budgets.get('children', 4))
        self.team_minutes = int(budgets.get('teamMinutes', 25))
        self.studios = studio.available()
        self.language = self.input.get('language', 'zh')
        self.rng = random.Random(seed_of(self.input['baseHash']))
        evo = self.state.get('evolution') or {}
        # Restart deterministically from cached calls/receipts; rebuild the visible state as we go.
        self.species = []
        self.archive = {}
        self.state['evolution'] = {'generation': 0, 'generations': self.generations, 'children': self.children,
                                   'species': self.species, 'archive': self.archive, 'champion': None,
                                   'weights': W, 'axes': ['challenge', 'progress'], 'started': evo.get('started', time.time())}

    # ---------- helpers ----------
    def publish(self, phase, **patch):
        self.state['evolution']['species'] = self.species
        self.state['evolution']['archive'] = self.archive
        self.progress(phase, **patch)

    def lang(self):
        return 'Simplified Chinese' if self.language == 'zh' else 'English'

    def naming(self):
        # The name must come from the game's own world. An unqualified "poetic" request made every species read as
        # classical Chinese verse regardless of genre, so the style is pinned to the game and the cliche is ruled out.
        return ('"name":"short variant name (<=12 chars) in the voice of THIS game: its own setting, genre, tone and vocabulary, hinting at what '
                'this mutation changes, the way a patch codename, edition title or creature from its world would sound. Do not default to '
                'classical, poetic, wuxia or ink-wash wording unless the game itself is set that way. Write it in ' + self.lang() +
                ', or in English if that fits the game better",' '"latin":"pseudo-Latin binomial"')

    def trajectories(self, name, limit=9000):
        folder = self.root / 'evidence' / name
        out = []
        for file in sorted(folder.glob('episode-*.json')):
            data = read(file)
            steps = data.get('steps', [])
            short = [{'keys': s['action'].get('keys'), 'ms': s['action'].get('duration_ms'),
                      'state': {k: s['state'].get(k) for k in ('scene', 'player', 'progress', 'won', 'lost', 'events') if isinstance(s.get('state'), dict)}}
                     for s in steps]
            out.append(file.name + ' (' + data.get('purpose', '')[:60] + '): ' + json.dumps(short, ensure_ascii=False)[-limit // 3:])
        return '\n'.join(out)[-limit:]

    def frames(self, name, count=3):
        frames = sorted((self.root / 'evidence' / name / 'runtime').glob('frame-*.png'), key=lambda p: p.stat().st_mtime)
        if not frames:
            return []
        step = max(1, len(frames) // count)
        return frames[::step][:count]

    def measure(self, name, played):
        """Behaviour descriptors from the actual bridge states (not model claims)."""
        folder = self.root / 'evidence' / name
        progress, challenge, won, lost = [], [], 0, 0
        for file in sorted(folder.glob('episode-*.json')):
            steps = read(file).get('steps', [])
            if not steps:
                continue
            states = [s.get('state') or {} for s in steps]
            final = states[-1]
            progress.append(max(progress_of(s) for s in states))
            first, last = health_of(states[0]), health_of(final)
            loss = 0.0
            if first and last is not None and first > 0:
                loss = clamp((first - last) / first)
            dead = any(bool(s.get('lost')) for s in states)
            won += int(any(bool(s.get('won')) for s in states))
            lost += int(dead)
            challenge.append(0.6 * (1.0 if dead else 0.0) + 0.4 * loss)
        n = max(1, len(progress))
        return {'progress': round(sum(progress) / n, 3), 'challenge': round(sum(challenge) / n if challenge else 0.0, 3),
                'won': won, 'lost': lost, 'episodes': len(progress)}

    # ---------- society ----------
    def society(self, sid, species, played):
        people = PERSONAS['people']
        reviewers = []
        for arch in PERSONAS['archetypes']:
            group = [p for p in people if p['arch'] == arch]
            reviewers.append(group[seed_of(sid + arch) % len(group)])
        roster = [{'id': p['id'], 'arch': p['archLabel'], 'name': p['name'], 'bio': p['bio'], 'style': p['style']} for p in reviewers]
        need_name = not species.get('name')
        answer = self.model.call(f'{sid}-society',
            'You simulate the player community of GameForge Darwin Evolution. Ten players with fixed personas each watched '
            'the REAL recorded play sessions of one game species (trajectories with actual keyboard input and bridge state, plus screenshots). '
            'Write what each persona would post after trying it, grounded ONLY in this evidence: crashes, unclear goals, unfair hits, '
            'slow starts, satisfying jumps, visible feedback. These players have played hundreds of indie games: a generic genre clone, '
            'placeholder box-and-circle art or a game that freezes bores or annoys them, and they say so plainly and specifically. '
            'Rating scale 1-5 where 3 = "fine, would not recommend"; most generic games deserve 1-2. Ratings must differ by persona taste and must not be inflated; '
            'quit_reason is required when stay=false. Never claim this is real human data. '
            'Return JSON {' + (self.naming() + ',' if need_name else '') +
            '"summary":"one-sentence community verdict","posts":[{"persona":"p..","tried":true,"rating":1,"stay":true,"quit_reason":null,'
            '"text":"<=60 chars in persona voice","day":1}]}. Exactly one post per persona (use the persona id such as "p3"), day 1-7. Language: ' + self.lang() + '.\n'
            'Species: ' + json.dumps({k: species.get(k) for k in ('name', 'gene', 'hypothesis', 'changes')}, ensure_ascii=False) +
            '\nPlay result: ' + json.dumps({k: played.get(k) for k in ('valid', 'episodes', 'errors')}, ensure_ascii=False)[-3000:] +
            '\nPersonas: ' + json.dumps(roster, ensure_ascii=False) +
            '\nActual trajectories:\n' + self.trajectories(played['name']),
            [(p, f'{played["name"]}/runtime/{p.name}') for p in self.frames(played['name'])])
        by_id = {p['id']: p for p in reviewers}
        by_id.update({p['name']: p for p in reviewers})  # models sometimes answer with the persona name
        posts = []
        for post in answer.get('posts', []):
            person = by_id.get(str(post.get('persona', '')).strip())
            if not person or any(p['persona'] == person['id'] for p in posts):
                continue
            rating = int(clamp(post.get('rating', 3), 1, 5))
            posts.append({'persona': person['id'], 'name': person['name'], 'arch': person['arch'], 'archLabel': person['archLabel'],
                          'tried': bool(post.get('tried', True)), 'rating': rating, 'stay': bool(post.get('stay', rating >= 4)),
                          'quit_reason': (post.get('quit_reason') or None) if not post.get('stay', rating >= 4) else None,
                          'text': str(post.get('text', ''))[:160], 'day': int(clamp(post.get('day', 1), 1, 7))})
        if len(posts) < 5:
            raise ValueError('Society simulation returned too few valid persona posts')
        if need_name:
            species['name'] = str(answer.get('name') or ('未命名变种' if self.language == 'zh' else 'Unnamed variant'))[:16]
            species['latin'] = str(answer.get('latin') or 'Ludus ignotus')[:40]
        social = self.diffuse(sid, posts)
        social['summary'] = str(answer.get('summary', ''))[:200]
        social['posts'] = sorted(posts, key=lambda p: p['day'])
        return social

    def diffuse(self, sid, posts):
        """Deterministic 7-day word-of-mouth model over the persona follow graph."""
        rng = random.Random(seed_of('society' + sid))
        people = PERSONAS['people']
        arch_rating, arch_stay = {}, {}
        for post in posts:
            arch_rating[post['arch']] = post['rating']
            arch_stay[post['arch']] = post['stay']
        followers = {p['id']: [q['id'] for q in people if p['id'] in q['follows']] for p in people}
        state = {p['id']: 0 for p in people}  # 0 unaware, 1 exposed, 2 tried+stayed, 3 quit
        heard = {p['id']: [] for p in people}
        seeds = [p['id'] for p in people if p['arch'] == 'kol'] + [post['persona'] for post in posts if post['day'] <= 2]
        for pid in seeds:
            state[pid] = max(state[pid], 1)
        timeline, tried, stayed, ratings = [], 0, 0, []
        for day in range(1, 8):
            today = []
            for p in people:
                pid = p['id']
                if state[pid] != 1:
                    continue
                rating = arch_rating.get(p['arch'], 3)
                buzz = sum(heard[pid]) / len(heard[pid]) if heard[pid] else 3
                chance = clamp(0.35 + 0.12 * (buzz - 3) + (0.25 if pid in seeds else 0))
                if rng.random() < chance:
                    tried += 1
                    ratings.append(rating)
                    keep = arch_stay.get(p['arch'], rating >= 4) and rating >= 3
                    state[pid] = 2 if keep else 3
                    stayed += int(keep)
                    if rng.random() < 0.55 + 0.1 * (rating - 3):
                        today.append((pid, rating))
            for pid, rating in today:
                for follower in followers[pid]:
                    heard[follower].append(rating)
                    if state[follower] == 0:
                        state[follower] = 1
            timeline.append([state[p['id']] for p in people])
        population = len(people)
        exposed = sum(1 for v in state.values() if v)
        reach = exposed / population
        try_rate = tried / max(1, exposed)
        retention = stayed / max(1, tried)
        sentiment = (sum(ratings) / len(ratings) - 3) / 2 if ratings else 0.0
        score = 0.3 * reach + 0.25 * try_rate + 0.3 * retention + 0.15 * (sentiment + 1) / 2
        return {'S': round(score, 3), 'metrics': {'population': population, 'exposed': exposed, 'tried': tried, 'retained': stayed,
                'reach': round(reach, 3), 'tryRate': round(try_rate, 3), 'retention': round(retention, 3), 'sentiment': round(sentiment, 3)},
                'timeline': timeline}

    # ---------- fitness / archive ----------
    def novelty(self, species):
        judged = clamp((species.get('critic') or {}).get('scores', {}).get('novelty', 3) / 10)
        if species['gene'] in ('origin', 'repair'):
            return round(judged, 3)
        alive = [s for s in self.species if s is not species and s['status'] == 'alive' and s['gene'] not in ('origin', 'repair')]
        same = sum(1 for s in alive if s['gene'] == species['gene'])
        gene_part = 1 - same / max(1, len(alive) + 1)
        return round(0.7 * judged + 0.3 * gene_part, 3)

    def score(self, species):
        f = species['fitness']
        f['novelty'] = self.novelty(species)
        f['F'] = round(sum(W[k] * f[k] for k in W), 3)
        x = bucket(species['metrics']['challenge'], CHALLENGE_BINS)
        y = bucket(species['metrics']['progress'], PROGRESS_BINS)
        species['cell'] = [x, y]
        key = f'{x}-{y}'
        current = next((s for s in self.species if s['id'] == self.archive.get(key)), None)
        if current is None or f['F'] > current['fitness']['F']:
            self.archive[key] = species['id']
            species['elite'] = True
            if current:
                current['elite'] = False

    def champion(self):
        eligible = [s for s in self.species if s['status'] == 'alive' and (s.get('root') or s.get('promoted'))]
        best = max(eligible, key=lambda s: s['fitness']['F'])
        self.state['evolution']['champion'] = best['id']
        self.best = read(self.root / 'evidence' / best['evidence'] / 'receipt.json')
        self.best_source = self.root / best['source']
        return best

    # ---------- species lifecycle ----------
    def evaluate(self, species, source, parent=None):
        sid = species['id']
        name = 'baseline' if sid == 's0' else sid
        self.publish('play', round=species['gen'], focus=sid)
        played = self.play(name, source, [p[1] for p in PLAYERS])
        species['evidence'] = name
        species['sourceHash'] = sha(source / 'index.html')
        species['play'] = {'valid': played['valid'], 'errors': played['errors'][:2], 'episodes': played['episodes'], 'video': played.get('video')}
        if not played['valid']:
            species['status'] = 'invalid'
            species['fitness'] = {'F': 0, 'critic': 0, 'review': 0, 'social': 0, 'progress': 0, 'novelty': 0}
            self.write_ledger(species, played)
            self.publish('select')
            return played
        species['metrics'] = self.measure(name, played)
        self.publish('critic', focus=sid)
        try:
            species['critic'] = self.critique(sid, species, played, source)
        except (ValueError, RuntimeError) as failure:
            if isinstance(failure, RuntimeError) and 'Ambiguous' not in str(failure) and 'failed validation' not in str(failure):
                raise
            species['critic'] = {'error': str(failure)[:200], 'scores': {a: 1 for a in AREAS}, 'C': 0.1, 'issues': []}
        reviews = []
        if parent is not None:
            parent_receipt = read(self.root / 'evidence' / parent['evidence'] / 'receipt.json')
            self.publish('review', focus=sid)
            reviews = [self.review(f'{sid}-review-ab', parent_receipt, played), self.review(f'{sid}-review-ba', played, parent_receipt)]
            for review, pair in zip(reviews, [(parent_receipt, played), (played, parent_receipt)]):
                cleaned = [citation_path(c) for c in review.get('evidence', [])]
                for citation in cleaned:
                    if not citation:
                        review['winner'] = 'unavailable'
                        continue
                    folder = self.root / 'evidence' / pair[0 if citation[0] == 'A' else 1]['name']
                    if citation[2:] not in read(folder / 'manifest.json'):
                        review['winner'] = 'unavailable'
                review['evidence'] = [c for c in cleaned if c]
            species['promoted'] = should_promote(played['valid'], reviews)
            votes = (1.0 if reviews[0].get('winner') == 'B' else 0.5 if reviews[0].get('winner') == 'tie' else 0.0) + \
                    (1.0 if reviews[1].get('winner') == 'A' else 0.5 if reviews[1].get('winner') == 'tie' else 0.0)
            review_score = votes / 2
        else:
            review_score = 0.5
        species['reviews'] = [{'order': o, 'winner': r.get('winner'), 'reason': str(r.get('reason', ''))[:600], 'evidence': r.get('evidence', [])[:6]}
                              for o, r in zip(['A/B', 'B/A'], reviews)]
        self.publish('society', focus=sid)
        try:
            species['society'] = self.society(sid, species, played)
        except (ValueError, RuntimeError) as failure:
            if isinstance(failure, RuntimeError) and 'Ambiguous' not in str(failure) and 'failed validation' not in str(failure):
                raise
            species.update(status='invalid', error='Society simulation unavailable: ' + str(failure)[:200],
                           fitness={'F': 0, 'critic': 0, 'review': 0, 'social': 0, 'progress': 0, 'novelty': 0})
            self.write_ledger(species, played)
            self.publish('select')
            return played
        species['status'] = 'alive'
        species['fitness'] = {'critic': species['critic']['C'], 'review': round(review_score, 3), 'social': species['society']['S'],
                              'progress': species['metrics']['progress'], 'novelty': 0}
        self.score(species)
        self.write_ledger(species, played)
        self.publish('select', focus=sid)
        return played

    # ---------- harsh critic ----------
    def motion(self, name):
        """Frozen = identical frames, or a player whose bridge position never changes while keys are pressed.
        Ambient animation (rain, blinking HUD) makes frames differ, so the bridge state is the stronger signal."""
        folder = self.root / 'evidence' / name
        frames = sorted((folder / 'runtime').glob('frame-*.png'), key=lambda p: p.stat().st_mtime)
        distinct = len({sha(p) for p in frames}) if frames else 0
        positions, pressed = set(), 0
        for file in sorted(folder.glob('episode-*.json')):
            for step in read(file).get('steps', []):
                player = (step.get('state') or {}).get('player') if isinstance(step.get('state'), dict) else None
                pressed += bool((step.get('action') or {}).get('keys'))
                if isinstance(player, dict):
                    positions.add((round(float(player.get('x') or 0)), round(float(player.get('y') or 0))))
        stuck = pressed >= 6 and len(positions) <= 2
        return {'frames': len(frames), 'distinct': distinct, 'positions': len(positions), 'stuck': stuck,
                'frozen': stuck or (len(frames) >= 4 and distinct <= max(2, len(frames) // 10))}

    def critique(self, sid, species, played, source):
        html = (source / 'index.html').read_text(encoding='utf-8')
        stats = code_stats(html)
        motion = self.motion(played['name'])
        boxy = placeholder_art(stats)
        answer = self.judge.call(f'{sid}-critic',
            'You are the harshest lead designer of an indie studio, reviewing one game build from its REAL play recordings '
            '(screenshots in play order, then keyboard trajectories with the visible bridge state) and measured statistics. '
            + RUBRIC + '\nReturn JSON ' + CRITIC_SHAPE + ' with 5-10 issues, most severe first; every issue must cite real evidence and '
            'carry a fix concrete enough to implement. Keep the JSON keys in English; values in ' + self.lang() + '.\n'
            'Measured motion (distinct frames among recorded frames): ' + json.dumps(motion) +
            '\nMeasured drawing code: ' + json.dumps({k: stats[k] for k in ('chars', 'primitiveCalls', 'detailCalls', 'primitiveShare', 'detail', 'feel')}, ensure_ascii=False) +
            '\nRuntime errors: ' + json.dumps(played.get('errors', [])[:3], ensure_ascii=False) +
            '\nUser goal: ' + self.input['goal'] +
            '\nTrajectories:\n' + self.trajectories(played['name'], 6000),
            [(p, f'{played["name"]}/runtime/{p.name}') for p in self.frames(played['name'], 6)])
        scores = {a: int(clamp(answer.get('scores', {}).get(a, 1), 1, 10)) for a in AREAS}
        caps = []
        if answer.get('derivative') and scores['novelty'] > 3:
            scores['novelty'] = 3; caps.append('derivative: novelty capped at 3')
        if boxy and scores['visual'] > 3:
            scores['visual'] = 3; caps.append('measured box/circle drawing: visual capped at 3')
        if motion['frozen'] or played.get('errors'):
            scores = {a: min(v, 2) for a, v in scores.items()}; caps.append('frozen screen or runtime error: all areas capped at 2')
        issues = []
        for issue in answer.get('issues', [])[:10]:
            if isinstance(issue, dict) and issue.get('problem'):
                issues.append({k: str(issue.get(k, ''))[:400] for k in ('severity', 'area', 'problem', 'evidence', 'fix')})
        return {'scores': scores, 'C': round(sum(scores.values()) / (10 * len(AREAS)), 3), 'caps': caps,
                'resembles': str(answer.get('resembles', ''))[:200], 'derivative': bool(answer.get('derivative')),
                'verdict': str(answer.get('verdict', ''))[:300], 'issues': issues,
                'strengths': [str(x)[:200] for x in answer.get('strengths', [])][:3],
                'measured': {'motion': motion, 'primitiveShare': stats['primitiveShare'], 'placeholderArt': boxy, 'feel': stats['feel']}}

    # ---------- review ledger: every real comment, verbatim ----------
    def write_ledger(self, species, played):
        entry = {'id': species['id'], 'name': species.get('name'), 'gen': species['gen'], 'parent': species.get('parent'),
                 'status': species['status'], 'critic': species.get('critic'), 'reviews': species.get('reviews'),
                 'community': {'summary': (species.get('society') or {}).get('summary'), 'posts': (species.get('society') or {}).get('posts', []),
                               'metrics': (species.get('society') or {}).get('metrics')},
                 'play': {'valid': played.get('valid'), 'errors': played.get('errors', [])[:3], 'metrics': species.get('metrics')},
                 'submission': species.get('submission')}
        atomic(self.root / 'ledger' / f'{species["id"]}.json', entry)
        return entry

    def reviews_markdown(self, parent):
        entry = read(self.root / 'ledger' / f'{parent["id"]}.json')
        zh = self.language == 'zh'
        out = ['# ' + ('这一版本收到的真实评价' if zh else 'Real reviews of this exact version'), '',
               ('以下内容全部来自对这一版本的真实试玩、评审和模拟玩家社区，原文照录，没有任何预设意见。' if zh else
                'Everything below was produced from real play of this exact build: critic, community and play evidence, verbatim. Nothing is preset.'), '']
        critic = entry.get('critic') or {}
        if critic:
            out += [studio.critique_markdown(critic, 'R').replace('# Critique (real, generated from your game\'s screenshots and play)', '## ' + ('严苛评审' if zh else 'Critic')).strip(),
                    '', 'Measured: ' + json.dumps(critic.get('measured', {}), ensure_ascii=False), 'Caps applied: ' + json.dumps(critic.get('caps', []), ensure_ascii=False), '']
        posts = sorted((entry.get('community') or {}).get('posts', []), key=lambda p: (p.get('rating', 3), p.get('stay', False)))
        if posts:
            out += ['## ' + ('玩家社区帖子（低分在前）' if zh else 'Community posts (lowest first)'),
                    'Community verdict: ' + str((entry.get('community') or {}).get('summary', '')),
                    'Word of mouth: ' + json.dumps((entry.get('community') or {}).get('metrics'), ensure_ascii=False)]
            for index, post in enumerate(posts, 1):
                out.append(f"- P{index} {post.get('name')} ({post.get('archLabel')}), {post.get('rating')}/5, "
                           f"{'stayed' if post.get('stay') else 'quit: ' + str(post.get('quit_reason'))}: {post.get('text')}")
            out.append('')
        for review in entry.get('reviews') or []:
            out.append(f"- Blind review vs its own parent ({review.get('order')}): winner {review.get('winner')}. {review.get('reason')}")
        play = entry.get('play') or {}
        out += ['', '## ' + ('试玩证据' if zh else 'Play evidence'), 'Errors: ' + json.dumps(play.get('errors'), ensure_ascii=False),
                'Measured progress/challenge: ' + json.dumps(play.get('metrics'), ensure_ascii=False)]
        return '\n'.join(out) + '\n'

    def history_markdown(self, parent):
        rows, node = [], parent
        while node:
            sub = node.get('submission') or {}
            rows.append(f"- {node['id']} {node.get('name') or ''} (gen {node['gen']}, critic {(node.get('critic') or {}).get('scores')}, "
                        f"F {node.get('fitness', {}).get('F')}): {node.get('hypothesis') or ''} | changes: {json.dumps(node.get('changes', []), ensure_ascii=False)}"
                        + (f" | answered: {sub.get('answered')}" if sub.get('answered') else ''))
            node = next((x for x in self.species if x['id'] == node.get('parent')), None)
        return '# Lineage (this version back to the original)\n\n' + '\n'.join(rows) + '\n'

    def new_species(self, sid, gen, parent, gene, **extra):
        species = {'id': sid, 'gen': gen, 'parent': parent['id'] if parent else None, 'gene': gene, 'status': 'embryo',
                   'name': extra.pop('name', ''), 'latin': extra.pop('latin', ''), 'createdAt': time.time(), 'elite': False,
                   'promoted': False, 'metrics': {'progress': 0, 'challenge': 0, 'won': 0, 'lost': 0, 'episodes': 0}, **extra}
        self.species.append(species)
        return species

    def build(self, sid, parent_source, plan, extra=''):
        original = (parent_source / 'index.html').read_text(encoding='utf-8')
        prompt = ('Implement this focused game mutation using small exact text edits. Return JSON {"edits":[{"before":"exact original substring","after":"replacement substring"}],"summary":"..."}. '
            'Each before string must be copied verbatim from the original and match exactly once (include enough surrounding code to be unique). At most 12 edits, no entire-file rewrite. Preserve unrelated code and keep output concise. '
            'Use only existing relative assets, no external network, libraries or new files. Preserve valid GameAgentBridge ready/reset(seed)/observe(), genuine input, challenges, win/lose. '
            'No test-only cheats, no hidden facts in observe. Keep JSON keys in English. Assets: ' + json.dumps(self.input['assets']) + extra +
            '\nPlan: ' + json.dumps(plan, ensure_ascii=False) + '\nConstraints: ' + self.input['constraints'] +
            '\nOriginal HTML:\n' + original)
        failure = None
        for attempt in range(2):
            name = f'{sid}-build' if attempt == 0 else f'{sid}-build-retry'
            answer = self.model.call(name, prompt if attempt == 0 else prompt + '\n\nYour previous edits were rejected: ' + failure +
                                     '\nReturn corrected edits whose before strings are verbatim, unique substrings of the original.')
            try:
                html = apply_edits_tolerant(original, answer.get('edits'))
                if '<html' not in html.lower() or 'GameAgentBridge' not in html:
                    raise ValueError('Mutation removed the HTML document or GameAgentBridge')
                ok, message = js_syntax_ok(html)
                if not ok:
                    raise ValueError(message)
                return html, answer, sum(len(e.get('after', '')) + len(e.get('before', '')) for e in answer.get('edits', []))
            except ValueError as error:
                failure = str(error)[:400]
        raise ValueError(failure)

    def write_source(self, sid, html, parent_source):
        folder = self.root / 'species' / sid
        folder.mkdir(parents=True, exist_ok=True)
        if (parent_source / 'assets').exists():
            shutil.copytree(parent_source / 'assets', folder / 'assets', dirs_exist_ok=True)
        (folder / 'index.html').write_text(html, encoding='utf-8')
        return folder

    def repair(self, root_species, played):
        """A crashing original cannot be compared; one repair mutation may make it testable."""
        error = '; '.join(played.get('errors', []))[:1500]
        species = self.new_species('s0r', 0, root_species, 'repair', hypothesis='修复试玩中暴露的运行时错误' if self.language == 'zh' else 'Fix the runtime error exposed by play',
                                   changes=[error[:200]])
        self.publish('build', focus='s0r')
        if self.studios:
            root_species['source'] = 'baseline'
            folder = self.fork('s0r', root_species)
            result = studio.build_with_fixup(folder, 'This game crashes or freezes in real play. Read REVIEWS.md (the real runtime errors and play '
                'evidence) and BRIEF.md, find the cause, fix it without redesigning the game, and run the playtest until it reports RUNS and '
                'the screenshots move. Then write SUBMISSION.json {"hypothesis":"what was broken","changes":["..."]} and finish.',
                self.root / 'teams' / 's0r.jsonl', self.team_minutes, lambda: (self.root / 'stop').exists())
            species['team'] = {'index': 0}
            self.adopt(species, root_species, folder, result)
            species['gene'] = 'repair'
            if species['status'] == 'stillborn':
                self.publish('select')
                return None
            result = self.evaluate(species, folder)
            if not result['valid']:
                return None
            species['root'] = True
            return species
        try:
            html, answer, diff = self.build('s0r', self.root / 'baseline',
                {'hypothesis': 'Fix the crash only', 'changes': ['Fix this browser runtime error without changing design: ' + error]},
                '\nRuntime error observed during real play (message | stack): ' + error)
        except Exception as failure:  # noqa: BLE001 - recorded as a failed mutation
            species.update(status='stillborn', error=str(failure)[:300])
            self.publish('select')
            return None
        species['summary'] = str(answer.get('summary', ''))[:300]
        species['diffChars'] = diff
        source = self.write_source('s0r', html, self.root / 'baseline')
        species['source'] = str(source.relative_to(self.root))
        result = self.evaluate(species, source)
        if not result['valid']:
            return None
        species['root'] = True
        return species

    def mutate(self, parent, gen, index):
        sid = f'g{gen}c{index}'
        parent_source = self.root / parent['source']
        genes = {g: sum(1 for s in self.species if s['gene'] == g and s['status'] == 'alive') for g in GENES}
        lineage = []
        node = parent
        while node:
            lineage.append({'gene': node['gene'], 'name': node.get('name'), 'hypothesis': node.get('hypothesis')})
            node = next((s for s in self.species if s['id'] == node.get('parent')), None)
        complaints = [p for p in parent.get('society', {}).get('posts', []) if not p['stay'] or p['rating'] <= 3][:6]
        self.publish('design', round=gen, focus=sid)
        try:
            plan = self.design_call(sid, genes, lineage, complaints, parent, parent_source)
        except (RuntimeError, ValueError) as failure:
            # Ambiguous or unparsable design output is never re-dispatched; the embryo is recorded as lost.
            if isinstance(failure, RuntimeError) and 'Ambiguous' not in str(failure) and 'failed validation' not in str(failure):
                raise
            species = self.new_species(sid, gen, parent, 'mechanic', status='stillborn', error=str(failure)[:300])
            species['status'] = 'stillborn'
            self.publish('select')
            return species
        return self.grow(sid, gen, parent, parent_source, plan)

    def design_call(self, sid, genes, lineage, complaints, parent, parent_source):
        return self.model.call(f'{sid}-design',
            'You are the semantic mutation operator of GameForge Darwin Evolution. Mutate the parent game species with a clear design intent so '
            'its offspring is more fun, clearer and more distinctive. Choose exactly ONE gene from ' + json.dumps(GENES) + '. '
            'Novelty pressure: prefer genes that are rare in the archive unless real play shows a critical problem. Keep genre, core loop, controls '
            'and all assets; do not add assets; no cheats, fake bridge state, removed challenge or inflated metrics. Small and buildable with <=12 exact edits. '
            'Return JSON {"gene":"one of the genes",' + self.naming() + ',"hypothesis":"...",'
            '"changes":["..."],"acceptance":["..."]}. Keep these JSON keys in English; values for hypothesis/changes in ' + self.lang() + '.\n'
            'Archive gene counts: ' + json.dumps(genes) + '\nExisting species names (the new name must be different): ' +
            json.dumps(sorted({x.get('name') for x in self.species if x.get('name')}), ensure_ascii=False) + '\nLineage (child to root): ' + json.dumps(lineage, ensure_ascii=False) +
            '\nCommunity complaints: ' + json.dumps(complaints, ensure_ascii=False) +
            '\nUser goal / constraints: ' + self.input['goal'] + ' / ' + self.input['constraints'] +
            '\nParent real play: ' + json.dumps(parent.get('play', {}), ensure_ascii=False)[-2500:] +
            '\nActual trajectories:\n' + self.trajectories(parent['evidence'], 6000) +
            '\nCode:\n' + (parent_source / 'index.html').read_text(encoding='utf-8'),
            self.frames(parent['evidence']))

    def grow(self, sid, gen, parent, parent_source, plan):
        plan = english_keys(plan)
        gene = plan.get('gene') if plan.get('gene') in GENES else 'mechanic'
        species = self.new_species(sid, gen, parent, gene, name=str(plan.get('name', ''))[:16], latin=str(plan.get('latin', ''))[:40],
                                   hypothesis=str(plan.get('hypothesis', ''))[:400], changes=[str(c)[:200] for c in plan.get('changes', [])][:6],
                                   acceptance=[str(c)[:200] for c in plan.get('acceptance', [])][:4])
        self.publish('build', focus=sid)
        try:
            html, answer, diff = self.build(sid, parent_source, plan)
        except Exception as failure:  # noqa: BLE001 - a failed build is a stillborn species, not a run failure
            species.update(status='stillborn', error=str(failure)[:300])
            self.publish('select')
            return species
        species['summary'] = str(answer.get('summary', ''))[:300]
        species['diffChars'] = diff
        source = self.write_source(sid, html, parent_source)
        species['source'] = str(source.relative_to(self.root))
        self.evaluate(species, source, parent)
        return species

    # ---------- studios (dsh teams) ----------
    def fork(self, sid, parent):
        """Copy the parent version into the team's own folder, with its real reviews and lineage."""
        folder = self.root / 'species' / sid
        if studio.resumable(folder, self.root / 'teams' / f'{sid}.jsonl'):
            return folder  # resumed run: keep the finished team's work
        if folder.exists():
            shutil.rmtree(folder)
        shutil.copytree(self.root / parent['source'], folder, ignore=shutil.ignore_patterns('REVIEWS.md', 'HISTORY.md', 'BRIEF.md', 'SUBMISSION.json', '.playtest', '.studio'))
        (folder / 'REVIEWS.md').write_text(self.reviews_markdown(parent), encoding='utf-8')
        (folder / 'HISTORY.md').write_text(self.history_markdown(parent), encoding='utf-8')
        (folder / 'BRIEF.md').write_text('\n\n'.join([
            '# Brief', 'Player request / goal: ' + self.input['goal'], 'Original title: ' + str(self.input.get('title', '')),
            '## Assets\n' + (json.dumps(self.input['assets'], ensure_ascii=False) if self.input['assets'] else 'None. Everything visible is drawn in code.'),
            '## How it will be judged\nA harsh critic scores novelty, visual, feel, feedback, clarity and depth from real screenshots '
            'and play recordings; a blind reviewer compares your build with its parent; a simulated community of picky players posts '
            'about it. Their real comments go to the teams that fork your version next.',
            '## ' + studio.CONTRACT,
            '## Self-test\nRun `' + studio.playtest_command() + '` (optionally `--keys \'[["ArrowRight",800],["ArrowUp",150]]\'`). It prints '
            'errors, bridge state per phase, canvas colour statistics and screenshot paths under .playtest/; open them with read_image.']), encoding='utf-8')
        return folder

    def team_task(self, index, parent):
        language = self.lang()
        return (f'You are independent game studio #{index + 1}. This folder is a fork of "{parent.get("name") or parent["id"]}", a game another '
                'team released. Read REVIEWS.md first: the real critique, community posts and play evidence of exactly this version. Then '
                'HISTORY.md (what earlier teams changed and how it scored) and BRIEF.md (technical contract and self-test). Decide for '
                'yourselves what to change. You may change anything (art, mechanics, levels, structure) or rewrite the game from scratch; '
                'there is no limit on the size of the change, only the contract must hold. Answer the reviews with the game itself, not '
                'with words. Work like real developers: change, run the playtest, open the screenshots with read_image and judge them as '
                f'harshly as the critic would, repeat. You have about {self.team_minutes} minutes; the process is stopped at the limit, so '
                'write a first SUBMISSION.json early and keep it updated as you work. SUBMISSION.json {"name":"short title for your version in the voice '
                'of the game\'s own world (<=12 chars, not classical/poetic unless the game is)","latin":"pseudo-Latin binomial","gene":'
                '"the ONE area you changed most, one of ' + json.dumps(GENES) + '","hypothesis":"why your version is better",'
                '"changes":["what you changed"],"answered":["R1","P3", "... review items you addressed"]} with values in ' + language +
                ', then finish with a short report. In-game text in ' + language + '.')

    def run_studios(self, gen, parents):
        """All teams of a generation build in parallel; their forks are then judged one by one."""
        jobs = []
        for index, parent in enumerate(parents):
            sid = f'g{gen}c{index}'
            species = self.new_species(sid, gen, parent, 'mechanic', team={'index': index + 1, 'status': 'building'})
            jobs.append((species, parent, self.fork(sid, parent), self.team_task(index, parent)))
        self.publish('build', round=gen, focus=jobs[0][0]['id'] if jobs else None)
        stop = lambda: (self.root / 'stop').exists()
        def work(species, folder, task):
            log = self.root / 'teams' / f'{species["id"]}.jsonl'
            result = studio.resumable(folder, log) or studio.build_with_fixup(folder, task, log, self.team_minutes, stop)
            late = studio.ensure_submission(folder, log, result.get('session'), stop)
            if late:
                result['lateSubmission'] = {k: late.get(k) for k in ('minutes', 'toolCalls', 'reverted')}
            return result
        with ThreadPoolExecutor(max_workers=max(1, len(jobs))) as pool:
            futures = [pool.submit(work, species, folder, task) for species, parent, folder, task in jobs]
            while not all(f.done() for f in futures):
                self.tick()
                time.sleep(1)
        for (species, parent, folder, task), future in zip(jobs, futures):
            try:
                result = future.result()
            except Exception as failure:  # noqa: BLE001 - a team that crashes is a stillborn species
                result = {'valid': False, 'gate': str(failure)[:300], 'toolCalls': 0, 'minutes': 0}
            self.adopt(species, parent, folder, result)
        for species, parent, folder, task in jobs:
            if species['status'] == 'embryo':
                self.evaluate(species, folder, parent)
                self.champion()
                self.publish('select', round=gen)

    def adopt(self, species, parent, folder, result):
        sub = {}
        try:
            sub = json.loads((folder / 'SUBMISSION.json').read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            pass
        sub = english_keys(sub) if isinstance(sub, dict) else {}
        studio.clean_workspace(folder)
        species['team'] = {'index': species['team']['index'], 'status': 'done' if result.get('valid') else 'rejected',
                           **{k: result.get(k) for k in ('minutes', 'toolCalls', 'tools', 'playtests', 'imagesViewed', 'timedOut', 'gate', 'reason', 'error')},
                           'report': str(result.get('final') or '')[:1500], 'log': f'teams/{species["id"]}.jsonl'}
        gene = sub.get('gene') if sub.get('gene') in GENES else 'mechanic'
        species.update(gene=gene, name=str(sub.get('name') or '')[:16], latin=str(sub.get('latin') or '')[:40],
                       hypothesis=str(sub.get('hypothesis') or '')[:400], changes=[str(c)[:240] for c in (sub.get('changes') or [])][:8],
                       submission={'answered': [str(a)[:12] for a in (sub.get('answered') or [])][:20]})
        if not result.get('valid'):
            species.update(status='stillborn', error=str(result.get('gate') or result.get('error') or 'team failed')[:300])
            return
        before = (self.root / parent['source'] / 'index.html').read_text(encoding='utf-8').splitlines()
        after = (folder / 'index.html').read_text(encoding='utf-8').splitlines()
        changed = sum(1 for line in difflib.unified_diff(before, after, lineterm='', n=0) if line[:1] in '+-' and line[:3] not in ('+++', '---'))
        species['diffChars'] = len('\n'.join(after))
        species['diffLines'] = changed
        species['source'] = str(folder.relative_to(self.root))

    def pick_parents(self):
        alive = [s for s in self.species if s['status'] == 'alive']
        elites = [s for s in alive if s.get('elite')] or alive
        chosen = []
        for _ in range(self.children):
            pool = self.rng.sample(elites, min(2, len(elites)))
            chosen.append(max(pool, key=lambda s: s['fitness']['F']))
        return chosen

    def execute(self):
        self.setup()
        self.publish('baseline', runtime=self.config['_runtime_identity'])
        root = self.new_species('s0', 0, None, 'origin', hypothesis='原始游戏（GameForge 生成）' if self.language == 'zh' else 'Original GameForge game',
                                source='baseline', root=True)
        played = self.evaluate(root, self.root / 'baseline')
        self.state['baseline'] = played
        if not played['valid']:
            root['root'] = False
            repaired = self.repair(root, played)
            if not repaired:
                self.state.update(status='failed', phase='baseline', error='Original game crashed in real play and one repair mutation did not make it testable. Inspect evidence.')
                atomic(self.root / 'state.json', self.state)
                return
        self.champion()
        self.state['evolution']['studios'] = 'dsh' if self.studios else 'single-call'
        for gen in range(1, self.generations + 1):
            self.state['evolution']['generation'] = gen
            if self.studios:
                self.run_studios(gen, self.pick_parents())
                continue
            for index, parent in enumerate(self.pick_parents()):
                self.mutate(parent, gen, index)
                self.champion()
                self.publish('select', round=gen)
        best = self.champion()
        self.state['retainedSpecies'] = best['id']
        self.finish()


    def finish(self, status='completed', reason=None):
        super().finish(status, reason)
        if getattr(self, 'best', None):
            champion = self.state['evolution'].get('champion')
            root = next((s for s in self.species if s.get('root')), None)
            if root and champion == root['id']:
                self.state['outcome'] = 'repaired' if root['id'] == 's0r' else 'no_verified_improvement'
            else:
                self.state['outcome'] = 'evolved_proxy'
            self.state['retainedSpecies'] = champion
            atomic(self.root / 'state.json', self.state)
