import hashlib
import json
import tempfile
import unittest
from unittest.mock import patch
import time
from pathlib import Path
from controller import Budget, should_promote, verify_evidence
from controller import Models, apply_edits

class ControllerTests(unittest.TestCase):
    def test_disagreement_and_missing_proof_keep_original(self):
        self.assertTrue(should_promote(True, [{'winner':'B','evidence':['A/x','B/y']},{'winner':'A','evidence':['A/y','B/x']}]))
        self.assertFalse(should_promote(True, [{'winner':'B'},{'winner':'A'}]))
        self.assertFalse(should_promote(True, [{'winner':'B','evidence':['A/x','B/y']},{'winner':'B','evidence':['A/y','B/x']}]))
        self.assertFalse(should_promote(False, [{'winner':'B'},{'winner':'A'}]))

    def test_builder_edits_must_match_exactly_once(self):
        self.assertEqual(apply_edits('alpha beta',[{'before':'beta','after':'gamma'}]),'alpha gamma')
        with self.assertRaises(ValueError):apply_edits('beta beta',[{'before':'beta','after':'gamma'}])
        with self.assertRaises(ValueError):apply_edits('alpha',[{'before':'missing','after':'gamma'}])
        with self.assertRaises(ValueError):apply_edits('alpha',[{'before':'','after':'gamma'}])

    def test_dispatch_reserves_budget_before_request(self):
        with tempfile.TemporaryDirectory() as tmp:
            b=Budget(Path(tmp),1,60)
            b.reserve('first')
            with self.assertRaises(RuntimeError): b.reserve('second')
            b2=Budget(Path(tmp),1,60)
            with self.assertRaises(RuntimeError): b2.reserve('retry')

    def test_evidence_tamper_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); (root/'frame.png').write_bytes(b'original')
            manifest={'frame.png':hashlib.sha256(b'original').hexdigest()}
            self.assertTrue(verify_evidence(root,manifest))
            (root/'frame.png').write_bytes(b'changed')
            self.assertFalse(verify_evidence(root,manifest))
            self.assertFalse(verify_evidence(root,{'../outside':'x'}))

    def test_stop_during_model_wait_is_prompt_and_never_redispatches(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict('os.environ',{'QWEN_API_KEY':'test-fixture-key','QWEN_BASE_URL':'https://example.test/v1'}):
            root=Path(tmp);budget=Budget(root,3,60);started=time.monotonic()
            def tick():
                if time.monotonic()-started>.08: raise InterruptedError('fixture stop')
            def slow_request(*args,**kwargs): time.sleep(2);raise OSError('fixture')
            model=Models(root,'qwen/test',budget,tick)
            with patch('urllib.request.urlopen',slow_request):
                with self.assertRaises(InterruptedError):model.call('pending','test')
            self.assertLess(time.monotonic()-started,.8)
            self.assertEqual(len(budget.state['calls']),1)
            model.tick=lambda:None
            with self.assertRaisesRegex(RuntimeError,'Ambiguous'):model.call('pending','test')

if __name__=='__main__': unittest.main()
