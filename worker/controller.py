"""GameForge controller. RGC supplies the isolated engine; policies are inert JSON.

Only this trusted host process can call models. Games get source/assets and an
empty output directory, never the run directory, environment or credentials.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import time
import threading
import queue
import urllib.request
import uuid


def atomic(file, value):
    file = Path(file)
    file.parent.mkdir(parents=True, exist_ok=True)
    temp = file.with_name(file.name + '.' + uuid.uuid4().hex + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(file)


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def verify_evidence(root, manifest):
    try:
        for name, expected in manifest.items():
            file = (root / name).resolve()
            if not file.is_relative_to(root.resolve()) or sha(file) != expected:
                return False
        return bool(manifest)
    except (OSError, ValueError):
        return False


def should_promote(valid, reviews):
    return bool(valid and len(reviews) == 2 and
                [r.get('winner') for r in reviews] == ['B', 'A'] and
                all(any(p.startswith('A/') for p in r.get('evidence', [])) and
                    any(p.startswith('B/') for p in r.get('evidence', [])) for r in reviews))


class BudgetExceeded(RuntimeError):
    pass


class Budget:
    def __init__(self, root, calls, seconds):
        self.file = root / 'budget.json'
        self.limit, self.seconds = calls, seconds
        self.state = json.loads(self.file.read_text()) if self.file.exists() else {'started': time.time(), 'calls': []}

    def check(self):
        if time.time() - self.state['started'] >= self.seconds:
            raise BudgetExceeded('Wall-clock budget exhausted')

    def reserve(self, name):
        self.check()
        if len(self.state['calls']) >= self.limit:
            raise BudgetExceeded('Model-call budget exhausted')
        self.state['calls'].append({'name': name, 'status': 'dispatched', 'at': time.time(), 'cost': None})
        atomic(self.file, self.state)
        return len(self.state['calls']) - 1

    def finish(self, index, usage):
        self.state['calls'][index].update(status='completed', usage=usage)
        atomic(self.file, self.state)


def clean_json(text):
    text = re.sub(r'^```(?:json)?\s*|\s*```$', '', text.strip())
    return json.loads(text)


def apply_edits(html, edits):
    if not isinstance(edits,list) or not 1<=len(edits)<=12:
        raise ValueError('Builder must return 1..12 exact edits')
    for edit in edits:
        before,after=edit.get('before'),edit.get('after')
        if not isinstance(before,str) or not before or not isinstance(after,str) or html.count(before)!=1:
            raise ValueError('Builder edit must match exactly once; original is preserved')
        html=html.replace(before,after,1)
    return html


class Models:
    def __init__(self, root, model, budget, tick):
        self.root, self.model, self.budget, self.tick = root, model, budget, tick
        provider, self.model_id = model.split('/', 1)
        if provider not in ('qwen', 'deepseek'):
            raise ValueError('Worker requires a configured qwen/ or deepseek/ model')
        self.key = os.environ.get(provider.upper() + '_API_KEY', '')
        self.base = os.environ.get(provider.upper() + '_BASE_URL', 'https://api.deepseek.com' if provider=='deepseek' else 'https://dashscope.aliyuncs.com/compatible-mode/v1').rstrip('/')
        if not self.key or not self.base.startswith('https://'):
            raise ValueError('Missing worker provider configuration')
        if not self.base.endswith('/v1'):
            self.base += '/v1'

    def call(self, name, prompt, pictures=()):
        self.tick()
        cache = self.root / 'calls' / (name + '.json')
        if cache.exists():
            return json.loads(cache.read_text(encoding='utf-8'))
        # A dispatched-but-unanswered request is ambiguous. Resume does not bill it again.
        previous=next((c for c in self.budget.state['calls'] if c['name']==name),None)
        if previous:
            if previous['status']=='completed':
                raise RuntimeError('Completed model output failed validation: '+name+'; start a new run to explicitly retry. Original request will not be repeated.')
            raise RuntimeError('Ambiguous model request '+name+'; start a new run to explicitly retry')
        slot = self.budget.reserve(name)
        content = [{'type': 'text', 'text': prompt}]
        for picture in pictures[:8]:
            file,label=picture if isinstance(picture,tuple) else (picture,None)
            if label:
                content.append({'type':'text','text':'Screenshot evidence path: '+label})
            content.append({'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' + base64.b64encode(Path(file).read_bytes()).decode()}})
        payload = {'model': self.model_id, 'messages': [{'role': 'user', 'content': content}], 'max_tokens': 16000,
                   'response_format': {'type':'json_object'}}
        if self.model.startswith('qwen/'):
            payload['enable_thinking'] = False
        else:
            payload['thinking'] = {'type': 'disabled'}
        request = urllib.request.Request(self.base + '/chat/completions', data=json.dumps(payload).encode(),
            headers={'Content-Type': 'application/json', 'Authorization': 'Bearer '+self.key})
        replies = queue.Queue()
        def request_model():
            try:
                with urllib.request.urlopen(request, timeout=180) as response:
                    replies.put((True, json.load(response)))
            except Exception as error:
                replies.put((False, type(error).__name__))
        threading.Thread(target=request_model, daemon=True).start()
        deadline = time.monotonic() + 180
        while True:
            self.tick()
            if time.monotonic() > deadline:
                raise TimeoutError('Model response timeout; dispatched request will not be automatically repeated')
            try:
                ok, result = replies.get(timeout=.1)
                break
            except queue.Empty:
                continue
        if not ok:
            raise RuntimeError('Model request failed ('+result+'); credentials and response body withheld')
        self.budget.finish(slot, result.get('usage'))
        choice=result['choices'][0]
        raw=choice['message']['content']
        atomic(cache.with_name(name+'-response.json'),{'content':raw,'finishReason':choice.get('finish_reason'),'usage':result.get('usage')})
        answer = clean_json(raw)
        atomic(cache, answer)
        self.tick()
        return answer


def evidence_manifest(root):
    return {str(p.relative_to(root)): sha(p) for p in sorted(root.rglob('*'))
            if p.is_file() and p.name != 'manifest.json' and not p.name.endswith('.tmp')}
