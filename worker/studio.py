#!/usr/bin/env python3
"""Studios: DeepSeek Harness (dsh) coding agents that build and fork games like open-source teams.

A team works in its own folder (a fork of the parent species, or an empty folder for the original game). It can
read and rewrite any file there, run the game with gf-playtest, look at the screenshots with read_image and iterate
for as long as its time budget allows. There is no cap on how much it changes.

Isolation: dsh runs in headless mode with its own sandbox in `workspace-write` mode, so commands can only write
inside the team's folder. The team gets the DeepSeek key (it is the agent's own model access) but never the run
directory, other species, the app data or other credentials. The game itself is still only executed by the
controller's isolated runtime for scoring; a team's own playtests use the same loopback-only Chromium setup.

CLI (used by the web app for the original game):
    python studio.py origin <workdir>     # reads <workdir>/job.json, prints a JSON result
"""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
import uuid

RUNNING = set()  # live dsh processes, terminated if this process is told to stop

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
CONTRACT = '''Technical contract (the game is rejected if any of these break):
- The whole game is ./index.html: inline <script> and <style> only, vanilla JS + <canvas>, no external libraries,
  CDNs, fetch or network. It must run when served as static files. Only files that already exist in ./assets may be
  referenced; you may not add image files, so anything new is drawn in code.
- Keep window.GameAgentBridge = {ready:true, reset(seed), observe()} working in the real game: reset(seed) restarts
  the same deterministic game without duplicating loops; observe() returns JSON with scene, player
  {x,y,vx,vy,health,onGround}, platforms, enemies, goal, progress (0..1), won, lost, events and controls, matching
  what is on screen and nothing the player cannot see. No test-only shortcuts, teleports or fake state.
- Real keyboard input plays the game: a visible start (Enter starts), R restarts, visible win and lose states.'''


def dsh_binary():
    for candidate in (os.environ.get('GAMEFORGE_DSH'), PROJECT / '.tools/dsh/node_modules/.bin/dsh', shutil.which('dsh')):
        if candidate and Path(candidate).exists():
            return str(candidate)
    return None


def available():
    return bool(dsh_binary()) and bool(os.environ.get('DEEPSEEK_API_KEY'))


def playtest_argv():
    return [os.environ.get('GAMEFORGE_PYTHON') or sys.executable, str(HERE / 'playtest.py')]


def playtest_command():
    return ' '.join(playtest_argv()) + ' .'


def team_env():
    data = Path(os.environ.get('GAMEFORGE_DATA_DIR') or PROJECT / '.gameforge-data').resolve()
    env = {k: os.environ[k] for k in ('PATH', 'HOME', 'LANG', 'TMPDIR', 'USER', 'SHELL') if k in os.environ}
    env.update(DEEPSEEK_API_KEY=os.environ.get('DEEPSEEK_API_KEY', ''), DSH_HOME=str(data / '.dsh'),
               DSH_PERMISSION_MODE='workspace-write', PYTHONDONTWRITEBYTECODE='1')
    # dsh talks to DeepSeek's Anthropic-compatible endpoint; an OpenAI-style base URL would 404 there.
    if os.environ.get('GAMEFORGE_DSH_BASE_URL'):
        env['DEEPSEEK_BASE_URL'] = os.environ['GAMEFORGE_DSH_BASE_URL']
    return env


def summarize_log(log):
    events = []
    for line in Path(log).read_text(encoding='utf-8', errors='replace').splitlines() if Path(log).exists() else []:
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    tools = {}
    for event in events:
        if event.get('type') == 'tool_call':
            tools[event.get('tool', '?')] = tools.get(event.get('tool', '?'), 0) + 1
    final = next((e for e in reversed(events) if e.get('type') == 'final'), {})
    session = next((e.get('sessionId') for e in events if e.get('type') == 'session'), None)
    images = sum(1 for e in events if e.get('type') == 'tool_call' and e.get('tool') == 'read_image')
    playtests = sum(1 for e in events if e.get('type') == 'tool_call' and e.get('tool') == 'bash' and 'playtest.py' in json.dumps(e.get('input', {})))
    return {'session': session, 'toolCalls': sum(tools.values()), 'tools': tools, 'playtests': playtests, 'imagesViewed': images,
            'final': str(final.get('text') or '')[:4000], 'reason': (final.get('reason') or {}).get('kind'),
            'error': ((final.get('reason') or {}).get('error') or {}).get('message')}


def run_team(workdir, task, log, minutes=25, session=None, should_stop=None):
    """Run one dsh headless job in workdir. Never raises for agent failures; the caller validates the folder."""
    binary = dsh_binary()
    if not binary:
        raise RuntimeError('dsh (DeepSeek Harness) not found; install @deepseek-ai/dsh or set GAMEFORGE_DSH')
    workdir, log = Path(workdir), Path(log)
    log.parent.mkdir(parents=True, exist_ok=True)
    command = [binary, '--profile', 'headless', '--json'] + (['--session-id', session] if session else []) + [task]
    started = time.time()
    with log.open('a', encoding='utf-8') as out, log.with_suffix('.err').open('a', encoding='utf-8') as err:
        process = subprocess.Popen(command, cwd=workdir, env=team_env(), stdout=out, stderr=err, stdin=subprocess.DEVNULL,
                                   start_new_session=True)
        RUNNING.add(process)
        timed_out = stopped = False
        while process.poll() is None:
            if should_stop and should_stop():
                stopped = True
            elif time.time() - started > minutes * 60:
                timed_out = True
            if stopped or timed_out:
                process.terminate()
                try:
                    process.wait(20)
                except subprocess.TimeoutExpired:
                    process.kill()
                break
            time.sleep(1)
    RUNNING.discard(process)
    result = summarize_log(log)
    result.update(minutes=round((time.time() - started) / 60, 1), timedOut=timed_out, stopped=stopped, exit=process.returncode)
    return result


def validate(folder):
    """Same static gate the controller applies before a fork is played."""
    from evolve import js_syntax_ok
    entry = Path(folder) / 'index.html'
    if not entry.exists():
        return False, 'index.html is missing'
    html = entry.read_text(encoding='utf-8', errors='replace')
    if '<html' not in html.lower() or 'GameAgentBridge' not in html:
        return False, 'index.html lost the HTML document or GameAgentBridge'
    if len(html) > 600_000:
        return False, 'index.html is larger than 600 KB'
    ok, message = js_syntax_ok(html)
    return ok, message


def ensure_submission(folder, log, session, should_stop=None, minutes=5):
    """A team that ran out of time without SUBMISSION.json is asked for it, and only for it."""
    folder = Path(folder)
    if (folder / 'SUBMISSION.json').exists() or not session:
        return None
    before = (folder / 'index.html').read_bytes() if (folder / 'index.html').exists() else b''
    result = run_team(folder, 'Time is up. Do NOT change index.html or any game file any more. Only write SUBMISSION.json as described '
                      'in your original task (name, latin, gene, hypothesis, changes, answered), reflecting what you actually changed, then finish.',
                      log, minutes, session=session, should_stop=should_stop)
    if (folder / 'index.html').exists() and (folder / 'index.html').read_bytes() != before:
        (folder / 'index.html').write_bytes(before)  # the submission turn may not touch the build that passed the gate
        result['reverted'] = True
    return result


def resumable(folder, log):
    """On resume, a fork whose team already worked (a session with tool calls and a build on disk) is not rebuilt."""
    folder, log = Path(folder), Path(log)
    if not (folder / 'index.html').exists() or not log.exists():
        return None
    summary = summarize_log(log)
    if not summary.get('session') or not summary.get('toolCalls'):
        return None
    ok, message = validate(folder)
    stat = log.stat()
    born = getattr(stat, 'st_birthtime', stat.st_ctime)
    summary.update(valid=ok, gate=message, resumed=True, minutes=round(max(0, stat.st_mtime - born) / 60, 1))
    return summary


def clean_workspace(folder):
    for junk in ('.playtest', '.dsh', 'node_modules'):
        shutil.rmtree(Path(folder) / junk, ignore_errors=True)


def build_with_fixup(folder, task, log, minutes, should_stop=None):
    """Run the team; if its submission fails the static gate, send it back once with the exact error."""
    result = run_team(folder, task, log, minutes, should_stop=should_stop)
    ok, message = validate(folder)
    if not ok and result.get('session') and not result.get('stopped'):
        retry = run_team(folder, 'Your submission was rejected by the GameForge gate: ' + message +
                         '. Fix it, rerun the playtest until it reports RUNS, and finish.', log, max(5, minutes // 3),
                         session=result['session'], should_stop=should_stop)
        result['fixup'] = {k: retry.get(k) for k in ('minutes', 'toolCalls', 'reason', 'error')}
        result['toolCalls'] += retry.get('toolCalls', 0)
        result['minutes'] = round(result['minutes'] + retry.get('minutes', 0), 1)
        result['final'] = retry.get('final') or result['final']
        ok, message = validate(folder)
    result['valid'], result['gate'] = ok, message
    return result


def origin_task(job):
    language = 'Simplified Chinese' if job.get('language', 'zh') == 'zh' else 'English'
    return ('You are an indie game studio. Build the original version of this game in the current folder, from scratch, '
            'as ./index.html. Read BRIEF.md first: it has the design, the asset list and the technical contract. Work like a '
            'real developer: write the game, run `' + playtest_command() + '` to play it headlessly, open the screenshots '
            'it reports with read_image and look at them critically, fix what is broken or ugly, and repeat. Do not stop at '
            'the first version that runs. When the playtest reports RUNS and you are satisfied, write SUBMISSION.json '
            '{"summary":"..."} and finish with a short report. In-game text in ' + language + '.')


def write_origin_brief(folder, job):
    folder = Path(folder)
    (folder / 'BRIEF.md').write_text('\n\n'.join([
        '# Brief: original game',
        '## Player request\n' + str(job.get('prompt', '')),
        '## Design document (from the GameForge designer)\n```json\n' + json.dumps(job.get('plan', {}), ensure_ascii=False, indent=1) + '\n```',
        '## Assets in ./assets\n' + (json.dumps(job.get('assets', []), ensure_ascii=False, indent=1) if job.get('assets') else
                                     'None. Everything visible must be drawn in code.'),
        '## How it will be judged\nA harsh critic scores novelty, visual, feel, feedback, clarity and depth from real '
        'screenshots and play recordings, and a simulated player community posts reviews. Their real comments will be '
        'handed to the teams that fork your game next.',
        '## ' + CONTRACT,
        '## Self-test\nRun `' + playtest_command() + '` (add `--keys \'[["ArrowRight",800],["ArrowUp",150]]\'` for your own '
        'input script). It prints errors, bridge state per phase, canvas colour statistics and screenshot paths under '
        '.playtest/; open them with read_image.']), encoding='utf-8')


def origin(workdir):
    """Build an original game with a dsh team, then let it revise once against a real critique of its own draft."""
    folder = Path(workdir).resolve()
    job = json.loads((folder / 'job.json').read_text(encoding='utf-8'))
    write_origin_brief(folder, job)
    minutes = int(job.get('minutes', 30))
    log = folder / '.studio' / 'origin.jsonl'
    result = build_with_fixup(folder, origin_task(job), log, minutes)
    report = {'team': result}
    if result['valid'] and job.get('critique', True):
        critique = critique_draft(folder, job)
        report['critique'] = critique
        if critique:
            (folder / 'REVIEWS.md').write_text(critique_markdown(critique), encoding='utf-8')
            revise = build_with_fixup(folder, 'A harsh critic just reviewed your draft from real screenshots. Read REVIEWS.md, '
                                      'take every critical and major issue seriously, improve the game, playtest and look at '
                                      'the screenshots again, then update SUBMISSION.json and finish.', log, max(10, minutes // 2))
            report['revision'] = revise
            if not revise['valid']:
                report['team']['valid'], report['team']['gate'] = False, revise['gate']
    clean_workspace(folder)
    report['valid'] = report['team']['valid'] and (report.get('revision') or report['team'])['valid']
    return report


def critique_draft(folder, job):
    """One critic call on the draft's own playtest screenshots (same standard as evolution)."""
    from standard import RUBRIC, CRITIC_SHAPE
    from controller import Budget, Models
    probe = subprocess.run(playtest_argv() + [str(folder), '--out', str(folder / '.studio' / 'critic-shots')],
                           capture_output=True, text=True, timeout=180)
    try:
        report = json.loads(probe.stdout)
    except json.JSONDecodeError:
        return None
    shots = [folder / s if not Path(s).is_absolute() else Path(s) for s in report.get('shots', [])]
    root = folder / '.studio'
    model = Models(root, 'deepseek/deepseek-flash', Budget(root, 4, 1800), lambda: None)
    language = 'Simplified Chinese' if job.get('language', 'zh') == 'zh' else 'English'
    try:
        return model.call('draft-critique-' + uuid.uuid4().hex[:6],
            'You are the harshest lead designer at a game studio reviewing a first playable. ' + RUBRIC +
            '\nReturn JSON ' + CRITIC_SHAPE + ' with 5-10 issues, most severe first. Values in ' + language + '.\n'
            'Player request: ' + str(job.get('prompt', ''))[:800] +
            '\nMeasured playtest (errors, bridge states, canvas colour stats, code drawing statistics): ' +
            json.dumps({k: report.get(k) for k in ('errors', 'bridgeReady', 'phases', 'pixels', 'code', 'placeholderArt')}, ensure_ascii=False)[:9000],
            [(p, p.name) for p in shots if p.exists()])
    except Exception:  # noqa: BLE001 - the draft is still a valid game without its critique
        return None


def critique_markdown(critique, prefix='R'):
    lines = ['# Critique (real, generated from your game\'s screenshots and play)', '',
             '**Verdict:** ' + str(critique.get('verdict', '')), '**Resembles:** ' + str(critique.get('resembles', '')),
             '**Scores:** ' + json.dumps(critique.get('scores', {}), ensure_ascii=False), '']
    for index, issue in enumerate(critique.get('issues', []), 1):
        lines.append(f"- {prefix}{index} [{issue.get('severity')}/{issue.get('area')}] {issue.get('problem')} "
                     f"(evidence: {issue.get('evidence')}) -> fix: {issue.get('fix')}")
    if critique.get('strengths'):
        lines += ['', 'Keep: ' + '; '.join(map(str, critique['strengths']))]
    return '\n'.join(lines) + '\n'


def _stop(signum, frame):
    for process in list(RUNNING):
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except OSError:
            pass
    sys.exit(143)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, _stop)
    sys.path.insert(0, str(HERE))
    if len(sys.argv) != 3 or sys.argv[1] != 'origin':
        print(__doc__)
        sys.exit(2)
    print(json.dumps(origin(sys.argv[2]), ensure_ascii=False))
