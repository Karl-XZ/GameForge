# Improvement worker

Owns isolated gameplay, finite play policies, evidence receipts, model budgets and conservative comparison. The web app owns records, versions, user feedback and explicit version selection; this worker must never write a GameRecord.

Read [the boundary and operating guide](../docs/IMPROVEMENT.md). Keep credentials in the trusted controller only. Game containers receive frozen source/assets and an empty evidence output, no credentials, socket or network. Policies are data-only JSON key sequences; never execute model-authored host code. Keep upstream licensing and local patch notes in UPSTREAM.txt.

Verification: `python -m unittest discover -s worker -p "test_*.py"`; actual runtime tests require Linux, non-root Docker access and the pinned runtime image. A model preference is not a human enjoyment result.
