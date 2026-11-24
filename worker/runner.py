#!/usr/bin/env python3
"""Durable, resumable improvement runner; run as a non-root Linux user."""
import copy
import fcntl
import json
import os
from pathlib import Path
import shutil
import sys
import time
import uuid

sys.path.insert(0, str(Path(__file__).parent / 'vendor'))
from controller import Models, Budget, BudgetExceeded, atomic, sha, evidence_manifest, verify_evidence, should_promote, apply_edits
from game_agent_lite.runtime import DockerGame, runtime_identity, cleanup_runtimes
from game_agent_lite.types import DEFAULTS


def read(file):
    return json.loads(Path(file).read_text(encoding='utf-8'))


class Run:
    def __init__(self, root):
        self.root = root.resolve()
        self.input = read(root / 'input.json')
        self.state = read(root / 'state.json')
        self.last_heartbeat = 0
        self.budget = Budget(root, self.input['budgets']['calls'], self.input['budgets']['minutes'] * 60)
        self.model = Models(root, self.input['model'], self.budget, self.tick)
        self.config = {**copy.deepcopy(DEFAULTS), 'engine': 'html', 'backend': 'codex', 'entry': 'index.html',
            'runtime': {**DEFAULTS['runtime'], 'mode': 'docker', 'image': (os.environ.get('GAMEFORGE_RUNTIME_IMAGE') or 'gameforge/runtime:html-v1')}}
        self.config['_runtime_identity'] = runtime_identity(self.config)

    def tick(self):
        if (self.root / 'stop').exists():
            raise InterruptedError('Stopped by user')
        self.budget.check()
        if time.time()-self.last_heartbeat > 2:
            self.last_heartbeat=time.time()
            self.state['heartbeat']=self.last_heartbeat
            atomic(self.root/'state.json',self.state)

    def progress(self, phase, **patch):
        self.state.update(status='running', phase=phase, updatedAt=time.time(), **patch)
        atomic(self.root / 'state.json', self.state)
        self.tick()

    def play(self, name, source):
        folder = self.root / 'evidence' / name
        receipt = folder / 'receipt.json'
        if receipt.exists():
            result = read(receipt)
            if result['sourceHash'] != sha(source / 'index.html') or not verify_evidence(folder, read(folder / 'manifest.json')):
                raise RuntimeError('Evidence identity/integrity failure')
            if result['valid'] and result.get('runtime')==self.config['_runtime_identity']:
                return result
        if folder.exists():
            archive=self.root/'interrupted'
            archive.mkdir(exist_ok=True)
            folder.rename(archive/(name+'-'+uuid.uuid4().hex))
        folder.mkdir(parents=True, exist_ok=True)
        engine = DockerGame(self.config, source, folder / 'runtime', self.tick)
        interrupted = False
        result = {'name': name, 'sourceHash': sha(source / 'index.html'), 'runtime':self.config['_runtime_identity'], 'valid': False, 'episodes': [], 'errors': [], 'limitations': 'Finite policy coverage; strategy completion is not game completion. No human study.'}
        try:
            engine.start()
            engine.reset(42)
            initial = engine.observe()
            policy = self.model.call(name+'-player',
                'You are a game playtester. Return JSON {"episodes":[{"purpose":"...","actions":[{"keys":["ArrowRight"],"duration_ms":500,"pointer":null}]}]}. '
                f'Exactly {self.input["budgets"]["episodes"]} episodes, each 8 to 24 actions. Purposes: first-time onboarding, goal completion, failure/recovery. '
                'Only actual keyboard inputs, no JavaScript, cheats or state changes. Max 1000ms/action. Enter starts; R restarts. Do not claim success from completing actions. '
                'Use the real rules and geometry to attempt the goal. Public state: '+json.dumps(initial['public'])+
                '\nSource (for learning controls, not evidence):\n'+(source/'index.html').read_text(encoding='utf-8'), [initial['image']])
            episodes = policy.get('episodes', [])
            if len(episodes) != self.input['budgets']['episodes']:
                raise ValueError('Player returned wrong episode count')
            for index, episode in enumerate(episodes):
                self.tick()
                engine.reset(42 + index)
                steps = []
                actions = episode.get('actions', [])
                if not 8 <= len(actions) <= 24:
                    raise ValueError('Player action count outside bounds')
                for action in actions:
                    self.tick()
                    if not isinstance(action.get('duration_ms'), int) or not 16 <= action['duration_ms'] <= 1000:
                        raise ValueError('Invalid action duration')
                    engine.act(action)
                    observation = engine.observe()
                    public = observation['public']
                    if not isinstance(public, dict):
                        raise ValueError('observe() must return an object')
                    steps.append({'action': action, 'state': public, 'frame':str(observation['image'].relative_to(folder))})
                    atomic(folder / f'episode-{index+1}.json', {'seed':42+index,'purpose':episode['purpose'],'steps':steps})
                result['episodes'].append({'seed':42+index,'purpose':episode['purpose'],'steps':len(steps),'final':steps[-1]['state']})
            result['valid'] = True
        except (InterruptedError, TimeoutError, BudgetExceeded):
            interrupted = True
            raise
        except Exception as error:
            result['errors'].append(str(error)[:1200])
        finally:
            video = engine.stop()
            if video:
                result['video'] = str(video['path'].relative_to(folder))
            if not interrupted:
                atomic(receipt, result)
            atomic(folder / 'manifest.json', evidence_manifest(folder))
        return result

    def finish(self, status='completed', reason=None):
        best=getattr(self,'best',None)
        source=getattr(self,'best_source',None)
        if best and source:
            self.state.update(retained=best['name'],resultHtml=str((source/'index.html').relative_to(self.root)),
                resultHash=sha(source/'index.html'),outcome='improved_proxy' if best['name']!='baseline' else 'no_verified_improvement')
        self.state.update(status=status,phase='done' if status=='completed' else self.state.get('phase'),error=reason,updatedAt=time.time())
        atomic(self.root/'state.json',self.state)

    def review(self, name, a, b):
        roots = [self.root/'evidence'/a['name'], self.root/'evidence'/b['name']]
        paths, pictures, reports = [], [], []
        for label, root in zip(['A','B'], roots):
            if not verify_evidence(root, read(root/'manifest.json')):
                raise RuntimeError('Evidence changed before review')
            for p in sorted(root.glob('episode-*.json')):
                paths.append(label+'/'+p.name)
                reports.append(label+'/'+p.name+': '+json.dumps(read(p),ensure_ascii=False)[-22000:])
            frames = sorted((root/'runtime').glob('frame-*.png'))
            for p in frames[::max(1,len(frames)//3)][:3]:
                paths.append(label+'/runtime/'+p.name)
                pictures.append((p,label+'/runtime/'+p.name))
        return self.model.call(name,
            'Blind game experience comparison. No source code or creation order is supplied. Screenshots are grouped A then B; trajectories include actual input and visible state. '
            'Assess goal clarity, responsive input, fairness, meaningful choices, pacing, feedback, recovery and regressions. Do not equate action count or winning with fun. '
            'Prefer tie/unavailable when evidence is insufficient. Return JSON {"winner":"A|B|tie|unavailable","reason":"...","evidence":["A/...","B/..."]}. '
            'Cite at least one actual listed evidence path from each side. Goal/constraints: '+self.input['goal']+' / '+self.input['constraints']+
            '\nAllowed evidence paths: '+json.dumps(paths)+'\n'+'\n'.join(reports), pictures)

    def execute(self):
        self.progress('baseline', runtime=self.config['_runtime_identity'])
        best_source = self.root/'baseline'
        best = self.play('baseline', best_source)
        self.state['baseline'] = best
        if not best['valid']:
            self.state.update(status='failed',phase='baseline',error='Original game is not testable. Inspect evidence and regenerate/repair GameAgentBridge; no improvement is claimed.')
            atomic(self.root/'state.json',self.state)
            return
        self.best,self.best_source=best,best_source
        if self.input.get('kind')=='evaluate':
            self.finish()
            self.state['outcome']='evaluated'
            atomic(self.root/'state.json',self.state)
            return
        history = []
        feedback = self.input.get('feedback', [])
        for round_number in range(1,self.input['budgets']['rounds']+1):
            self.progress('design', round=round_number, history=history)
            trace='\n'.join(p.name+': '+p.read_text(encoding='utf-8')[-16000:] for p in sorted((self.root/'evidence'/best['name']).glob('episode-*.json')))
            frames=sorted((self.root/'evidence'/best['name']/'runtime').glob('frame-*.png'))
            plan = self.model.call(f'r{round_number}-design',
                'Game design critic. Return JSON {"hypothesis":"...","changes":["..."],"acceptance":["..."]}. Propose a small focused improvement supported by actual play. '
                'Keep genre/core loop, all assets and controls; do not add assets. No cheats, fake bridge state, removed challenge, or inflated metrics. '
                'Goal: '+self.input['goal']+'\nConstraints: '+self.input['constraints']+'\nFeedback: '+json.dumps(feedback[-6:],ensure_ascii=False)+
                '\nActual play: '+json.dumps(best,ensure_ascii=False)+'\nRecent results: '+json.dumps(history[-2:],ensure_ascii=False)+
                '\nActual trajectories: '+trace+'\nCode: '+(best_source/'index.html').read_text(encoding='utf-8'),frames[::max(1,len(frames)//3)][:3])
            self.progress('build', plan=plan)
            candidate = self.root/f'candidate-{round_number}'
            answer = self.model.call(f'r{round_number}-build',
                'Implement this focused game improvement using small exact text edits. Return JSON {"edits":[{"before":"exact original substring","after":"replacement substring"}],"summary":"..."}. '
                'Each before string must match the original exactly once. At most 12 edits, no entire-file rewrite. Preserve unrelated code and keep output concise. '
                'Use only existing relative assets, no external network, libraries or new files. Preserve valid GameAgentBridge ready/reset(seed)/observe(), genuine input, challenges, win/lose. '
                'No test-only cheats, no hidden facts in observe. Assets: '+json.dumps(self.input['assets'])+
                '\nPlan: '+json.dumps(plan,ensure_ascii=False)+'\nConstraints: '+self.input['constraints']+
                '\nOriginal HTML:\n'+(best_source/'index.html').read_text(encoding='utf-8'))
            html = apply_edits((best_source/'index.html').read_text(encoding='utf-8'),answer['edits']) if 'edits' in answer else answer.get('html', '')
            if not isinstance(html,str) or '<html' not in html.lower() or 'GameAgentBridge' not in html:
                raise ValueError('Builder returned incomplete HTML')
            candidate.mkdir(exist_ok=True)
            if (best_source/'assets').exists():
                shutil.copytree(best_source/'assets',candidate/'assets',dirs_exist_ok=True)
            (candidate/'index.html').write_text(html,encoding='utf-8')
            self.progress('play')
            played = self.play(f'r{round_number}', candidate)
            self.progress('review')
            reviews = [self.review(f'r{round_number}-review-ab',best,played),self.review(f'r{round_number}-review-ba',played,best)] if played['valid'] else []
            # Citation validation is independent of the model's claimed winner.
            for review, pair in zip(reviews, [(best,played),(played,best)]):
                for citation in review.get('evidence',[]):
                    if not isinstance(citation,str) or not citation.startswith(('A/','B/')):
                        review['winner']='unavailable';continue
                    root=self.root/'evidence'/pair[0 if citation[0]=='A' else 1]['name']
                    relative=citation[2:]
                    if relative not in read(root/'manifest.json'):
                        review['winner']='unavailable'
            promote = should_promote(played['valid'],reviews)
            history.append({'round':round_number,'plan':plan,'candidate':played,'reviews':reviews,'promoted':promote})
            if promote:
                best, best_source = played, candidate
                self.best,self.best_source=best,best_source
            self.progress('select',history=history,retained=best['name'])
            if len(history)>=2 and not any(h['promoted'] for h in history[-2:]):
                self.state['stopReason']='Two consecutive rounds produced no verified improvement'
                break
        self.finish()


def main():
    root=Path(sys.argv[1]).resolve()
    with (root/'worker.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        run=None
        try:
            run=Run(root)
            run.execute()
        except BaseException as error:
            if run:
                run.finish('completed' if isinstance(error,BudgetExceeded) and getattr(run,'best',None) else 'stopped' if isinstance(error,InterruptedError) else 'failed',str(error)[:1800])
                return
            state=read(root/'state.json')
            # All provider errors are sanitized in Models; never include environment or raw HTTP bodies.
            state.update(status='stopped' if isinstance(error,InterruptedError) else 'failed',error=str(error)[:1800],updatedAt=time.time())
            atomic(root/'state.json',state)
        finally:
            cleanup_runtimes(root)

if __name__=='__main__': main()
