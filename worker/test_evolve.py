import json
import tempfile
import unittest
from pathlib import Path

from controller import citation_path, clean_json
from runner import normalize_policy
from evolve import Evolution, bucket, js_syntax_ok, progress_of, PERSONAS, CHALLENGE_BINS, PROGRESS_BINS, apply_edits_tolerant, english_keys


def bare():
    run = Evolution.__new__(Evolution)
    run.species, run.archive = [], {}
    return run


class EvolveTest(unittest.TestCase):
    def test_policy_normalization_counts_changes(self):
        episodes = [{'actions': [{'keys': ['ArrowRight', 'ArrowRight'], 'duration_ms': 1200}, {'keys': ['Space'], 'duration_ms': 5.4}] + [{'keys': [], 'duration_ms': 100, 'pointer': None}] * 30}]
        changed = normalize_policy(episodes)
        actions = episodes[0]['actions']
        self.assertEqual(len(actions), 24)
        self.assertEqual(actions[0], {'keys': ['ArrowRight'], 'duration_ms': 1000, 'pointer': None})
        self.assertEqual(actions[1]['duration_ms'], 16)
        self.assertGreaterEqual(changed, 4)

    def test_citations_accept_paths_with_explanations_only(self):
        self.assertEqual(citation_path('A/episode-1.json shows progress'), 'A/episode-1.json')
        self.assertEqual(citation_path('B/runtime/frame-ab.png 显示 HUD'), 'B/runtime/frame-ab.png')
        self.assertIsNone(citation_path('the left screenshot'))
        self.assertIsNone(citation_path(None))

    def test_clean_json_takes_first_object(self):
        self.assertEqual(clean_json('```json\n{"a":1}\n```'), {'a': 1})
        self.assertEqual(clean_json('{"a":1}\n{"b":2}'), {'a': 1})

    def test_syntax_check_never_executes(self):
        marker = Path(tempfile.gettempdir()) / 'gameforge-should-not-exist'
        marker.unlink(missing_ok=True)
        ok, _ = js_syntax_ok("<html><script>require('fs').writeFileSync(%r,'x')</script></html>" % str(marker))
        self.assertTrue(ok)
        self.assertFalse(marker.exists())
        ok, message = js_syntax_ok('<html><script>function (</script></html>')
        self.assertFalse(ok)
        self.assertIn('syntax', message)

    def test_tolerant_edits_stay_unique(self):
        html = '<html><script>\n  let speed = 3;\n  let jump = 9;\n</script></html>'
        out = apply_edits_tolerant(html, [{'before': 'let speed = 3;  let jump = 9;', 'after': 'let speed = 4; let jump = 10;'}])
        self.assertIn('let speed = 4; let jump = 10;', out)
        with self.assertRaises(ValueError):
            apply_edits_tolerant('<p>a</p><p>a</p>', [{'before': '<p>a</p>', 'after': 'b'}])
        with self.assertRaises(ValueError):
            apply_edits_tolerant(html, [{'before': 'let gravity = 1;', 'after': 'x'}])

    def test_design_keys_are_normalised(self):
        self.assertEqual(english_keys({'基因': '反馈', '名称': '墨引'}), {'gene': 'feedback', 'name': '墨引'})

    def test_progress_and_buckets(self):
        self.assertEqual(progress_of({'won': True, 'progress': 0}), 1.0)
        self.assertAlmostEqual(progress_of({'progress': 45}), 0.45)
        self.assertEqual(bucket(0.0, CHALLENGE_BINS), 0)
        self.assertEqual(bucket(0.31, PROGRESS_BINS), 2)

    def test_diffusion_is_deterministic_and_bounded(self):
        posts = [{'persona': p['id'], 'arch': p['arch'], 'rating': 4 if i % 2 else 2, 'stay': bool(i % 2), 'day': 1 + i % 3}
                 for i, p in enumerate(PERSONAS['people'][::4])]
        a, b = bare().diffuse('g1c0', posts), bare().diffuse('g1c0', posts)
        self.assertEqual(a, b)
        self.assertTrue(0 <= a['S'] <= 1)
        self.assertEqual(len(a['timeline']), 7)
        self.assertEqual(len(a['timeline'][0]), len(PERSONAS['people']))

    def test_archive_keeps_fittest_per_niche(self):
        run = bare()
        def species(sid, review):
            s = {'id': sid, 'gene': 'feedback', 'status': 'alive', 'diffChars': 900, 'elite': False,
                 'metrics': {'challenge': 0.0, 'progress': 0.05}, 'fitness': {'critic': review, 'review': review, 'social': 0.5, 'progress': 0.05, 'novelty': 0}}
            run.species.append(s); run.score(s); return s
        weak, strong = species('a', 0.0), species('b', 1.0)
        self.assertEqual(run.archive['0-0'], 'b')
        self.assertTrue(strong['elite'])
        self.assertFalse(weak['elite'])

    def test_champion_requires_root_or_promotion(self):
        run = bare()
        root = {'id': 's0', 'status': 'alive', 'root': True, 'fitness': {'F': 0.4}, 'evidence': 'baseline', 'source': 'baseline'}
        child = {'id': 'g1c0', 'status': 'alive', 'promoted': False, 'fitness': {'F': 0.9}, 'evidence': 'g1c0', 'source': 'species/g1c0'}
        run.species += [root, child]
        with tempfile.TemporaryDirectory() as folder:
            run.root = Path(folder)
            for name in ('baseline', 'g1c0'):
                (run.root / 'evidence' / name).mkdir(parents=True)
                (run.root / 'evidence' / name / 'receipt.json').write_text(json.dumps({'name': name}))
            run.state = {'evolution': {}}
            self.assertEqual(run.champion()['id'], 's0')
            child['promoted'] = True
            self.assertEqual(run.champion()['id'], 'g1c0')

    def test_critic_caps_are_measured_not_claimed(self):
        run = bare()
        run.language, run.input = 'en', {'goal': 'g'}
        class Judge:
            def call(self, name, prompt, pictures=()):
                return {'derivative': True, 'scores': {'novelty': 9, 'visual': 9, 'feel': 7, 'feedback': 7, 'clarity': 7, 'depth': 7},
                        'issues': [{'severity': 'major', 'area': 'visual', 'problem': 'boxes', 'evidence': 'x', 'fix': 'draw a silhouette'}]}
        run.judge = Judge()
        with tempfile.TemporaryDirectory() as folder:
            run.root = Path(folder)
            source = run.root / 'src'; source.mkdir()
            (source / 'index.html').write_text('<html><script>' + 'ctx.fillRect(0,0,1,1);' * 40 + '</script></html>')
            frames = run.root / 'evidence' / 'g1c0' / 'runtime'; frames.mkdir(parents=True)
            for i in range(8):
                (frames / f'frame-{i}.png').write_bytes(b'same')
            critic = run.critique('g1c0', {}, {'name': 'g1c0', 'errors': []}, source)
        self.assertTrue(critic['measured']['motion']['frozen'])
        self.assertLessEqual(max(critic['scores'].values()), 2)
        self.assertEqual(len(critic['caps']), 3)

    def test_reviews_markdown_is_verbatim(self):
        run = bare()
        run.language = 'en'
        with tempfile.TemporaryDirectory() as folder:
            run.root = Path(folder)
            species = {'id': 's0', 'gen': 0, 'status': 'alive', 'critic': {'verdict': 'Generic.', 'scores': {}, 'issues': [
                {'severity': 'critical', 'area': 'novelty', 'problem': 'stock collect-3 loop', 'evidence': 'f1', 'fix': 'add X'}]},
                'society': {'summary': 's', 'posts': [{'name': 'Ann', 'archLabel': 'KOL', 'rating': 1, 'stay': False, 'quit_reason': 'boring', 'text': 'meh'}]}}
            run.write_ledger(species, {'valid': True, 'errors': []})
            text = run.reviews_markdown(species)
        self.assertIn('R1 [critical/novelty] stock collect-3 loop', text)
        self.assertIn('P1 Ann (KOL), 1/5, quit: boring: meh', text)


if __name__ == '__main__':
    unittest.main()
