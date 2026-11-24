"""Opt-in local Chromium sandbox for hosts without Docker (macOS / Windows dev).

Selected only with GAMEFORGE_RUNTIME=local. It is weaker than the Docker runtime and is
labelled as such in every receipt (runtime.mode == "local-chromium-sandbox"):

* the frozen game is served read-only from a private loopback port;
* every request that is not for that exact origin is aborted (no internet, no app APIs);
* service workers, downloads and permissions are disabled;
* Chromium's own renderer sandbox stays enabled (we never pass --no-sandbox);
* the browser gets no credentials: model keys live only in the controller process
  and the game never sees the environment, the run directory or other projects.

Process, memory and file-system isolation are those of a normal Chromium renderer, not a
container. Use Docker on Linux for untrusted multi-user deployments.
"""
from functools import partial
import hashlib
from http.server import ThreadingHTTPServer
import os
from pathlib import Path
import sys
import threading

sys.path.insert(0, str(Path(__file__).parent / 'vendor'))
from game_agent_lite.game import HTMLGame, QuietHandler, VIDEO_WIDTH, VIDEO_HEIGHT  # noqa: E402

MODE = 'local-chromium-sandbox'


def local_identity():
    from importlib.metadata import version
    source = Path(__file__).read_bytes()
    return {'mode': MODE, 'protocol': 'gameforge-local-1', 'renderer': 'chromium',
            'playwright': version('playwright'), 'platform': sys.platform,
            'adapter_sha256': hashlib.sha256(source).hexdigest()[:16],
            'isolation': 'network-allowlist + chromium renderer sandbox (not a container)'}


class LocalSandboxGame(HTMLGame):
    def start(self):
        from playwright.sync_api import sync_playwright
        handler = partial(QuietHandler, directory=str(self.project))
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        origin = f'http://127.0.0.1:{self.server.server_port}/'
        self.pw = sync_playwright().start()
        self.browser = self.pw.chromium.launch(headless=self.config['headless'], args=['--mute-audio'])
        self.context = self.browser.new_context(viewport={'width': 960, 'height': 540}, service_workers='block',
                                                accept_downloads=False, permissions=[],
                                                record_video_dir=str(self.output / 'video'),
                                                record_video_size={'width': VIDEO_WIDTH, 'height': VIDEO_HEIGHT})
        self.blocked = []

        def guard(route):
            url = route.request.url
            if url.startswith(origin) and route.request.method in ('GET', 'HEAD'):
                return route.continue_()
            if not url.startswith(('data:', 'blob:')):
                self.blocked.append(url[:200])
            return route.abort()
        self.context.route('**/*', guard)
        self.page = self.context.new_page()
        self.errors = []
        def page_error(error):
            stack = (getattr(error, 'stack', '') or '').replace(origin, './')
            lines = [line.strip() for line in stack.splitlines()[1:4]]
            self.errors.append(str(error) + (' | ' + ' | '.join(lines) if lines else ''))
        self.page.on('pageerror', page_error)
        self.page.goto(origin + self.config['entry'])
        self.page.wait_for_function('() => window.GameAgentBridge?.ready === true', timeout=15000)
        self.page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')


def enabled():
    return os.environ.get('GAMEFORGE_RUNTIME', '').strip().lower() == 'local'
