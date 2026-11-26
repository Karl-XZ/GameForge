# Improvement worker

Owns isolated gameplay, finite play policies, evidence receipts, model budgets and conservative comparison. The web app owns records, versions, user feedback and explicit version selection; this worker must never write a GameRecord.

Read [the boundary and operating guide](../docs/IMPROVEMENT.md). Keep credentials in the trusted controller only. Game containers receive frozen source/assets and an empty evidence output, no credentials, socket or network. Policies are data-only JSON key sequences. The one sanctioned exception is the dsh studio (studio.py): a DeepSeek Harness agent that runs in dsh's own sandbox in workspace-write mode inside its fork folder only. From the controller it receives the DeepSeek key and nothing else; it never gets the run directory, other species or app data. Never execute model-authored code on the host anywhere else. Keep upstream licensing and local patch notes in UPSTREAM.txt.

Verification: `python -m unittest discover -s worker -p "test_*.py"`; actual runtime tests require Linux, non-root Docker access and the pinned runtime image. A model preference is not a human enjoyment result.
