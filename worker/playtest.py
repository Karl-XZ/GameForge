#!/usr/bin/env python3
"""gf-playtest: the studio's self-test tool.

A dsh team runs this inside its own fork to see what a player would see before submitting:

    python playtest.py [game_dir] [--keys '[["ArrowRight",900],["Space",120]]'] [--out .playtest]

It serves the folder on a private loopback port (no other origin is reachable), loads index.html in headless
Chromium, presses Enter, plays a key script, and writes screenshots plus a JSON report: runtime errors,
GameAgentBridge state after each phase, canvas colour/edge statistics and code statistics. The screenshots can be
opened with the agent's read_image tool. Exit code 1 when the game crashes or the bridge never becomes ready.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading

sys.path.insert(0, str(Path(__file__).parent))
from artstats import code_stats, placeholder_art, PIXEL_JS  # noqa: E402

DEFAULT_SCRIPT = [
    ['ArrowRight', 900], ['ArrowUp', 160], ['ArrowRight', 700], ['Space', 160], ['z', 120],
    ['ArrowRight', 1200], ['ArrowUp', 200], ['ArrowLeft', 300], ['ArrowRight', 1500], ['x', 120], ['ArrowRight', 1500],
]


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('game', nargs='?', default='.')
    parser.add_argument('--keys', help='JSON list of [key, hold_ms] pairs; joined keys like "ArrowRight+ArrowUp" are held together')
    parser.add_argument('--out', default='.playtest')
    parser.add_argument('--shots', type=int, default=4)
    args = parser.parse_args()
    game = Path(args.game).resolve()
    entry = game / 'index.html'
    out = (game / args.out) if not Path(args.out).is_absolute() else Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob('shot-*.png'):
        old.unlink()
    report = {'entry': str(entry), 'errors': [], 'console': [], 'blocked': [], 'phases': [], 'shots': []}
    if not entry.exists():
        report['errors'].append('index.html not found')
        print(json.dumps(report, ensure_ascii=False, indent=1))
        return 1
    html = entry.read_text(encoding='utf-8', errors='replace')
    report['code'] = code_stats(html)
    script = json.loads(args.keys) if args.keys else DEFAULT_SCRIPT

    from playwright.sync_api import sync_playwright
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(game)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/'
    crashed = False
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--mute-audio'])
        context = browser.new_context(viewport={'width': 960, 'height': 540}, service_workers='block')

        def guard(route):
            url = route.request.url
            if url.startswith(origin) or url.startswith(('data:', 'blob:')):
                return route.continue_()
            report['blocked'].append(url[:160])
            return route.abort()
        context.route('**/*', guard)
        page = context.new_page()
        page.on('pageerror', lambda e: report['errors'].append(str(e)[:400]))
        page.on('console', lambda m: report['console'].append(m.text[:200]) if m.type == 'error' else None)
        page.goto(origin + 'index.html')
        try:
            page.wait_for_function('() => window.GameAgentBridge?.ready === true', timeout=15000)
            report['bridgeReady'] = True
        except Exception:  # noqa: BLE001
            report['bridgeReady'] = False
        page.wait_for_timeout(600)

        def observe():
            try:
                return page.evaluate('() => { try { return window.GameAgentBridge && window.GameAgentBridge.observe(); } catch (e) { return {observeError: String(e)}; } }')
            except Exception as error:  # noqa: BLE001
                return {'observeError': str(error)[:200]}

        def shoot(label):
            path = out / f'shot-{len(report["shots"]) + 1}-{label}.png'
            page.screenshot(path=str(path))
            report['shots'].append(str(path.relative_to(game)) if path.is_relative_to(game) else str(path))

        shoot('title')
        report['pixelsTitle'] = page.evaluate(PIXEL_JS)
        page.keyboard.press('Enter')
        page.wait_for_timeout(500)
        every = max(1, len(script) // max(1, args.shots - 1))
        for index, (keys, hold) in enumerate(script):
            parts = str(keys).split('+')
            for key in parts:
                page.keyboard.down(key)
            page.wait_for_timeout(max(16, min(3000, int(hold))))
            for key in reversed(parts):
                page.keyboard.up(key)
            page.wait_for_timeout(60)
            if (index + 1) % every == 0 or index == len(script) - 1:
                state = observe()
                compact = {k: state.get(k) for k in ('scene', 'player', 'progress', 'won', 'lost', 'events', 'observeError')} if isinstance(state, dict) else state
                report['phases'].append({'after': f'{index + 1}/{len(script)}', 'state': compact})
                if len(report['shots']) < args.shots + 1:
                    shoot(f'play{index + 1}')
        report['pixels'] = page.evaluate(PIXEL_JS)
        browser.close()
    server.shutdown()
    report['placeholderArt'] = placeholder_art(report['code'], report.get('pixels'))
    crashed = bool(report['errors']) or not report.get('bridgeReady')
    report['verdict'] = 'CRASH_OR_NOT_READY' if crashed else 'RUNS'
    print(json.dumps(report, ensure_ascii=False, indent=1))
    return 1 if crashed else 0


if __name__ == '__main__':
    sys.exit(main())
