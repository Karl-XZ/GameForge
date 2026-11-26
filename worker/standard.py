"""The fixed scoring standard of the harsh critic.

The standard is fixed so scores stay comparable across generations. What a team should change is NEVER written
here: it comes only from the real critique, community posts and play evidence of each run (see ledger.py).
"""
AREAS = ['novelty', 'visual', 'feel', 'feedback', 'clarity', 'depth']

RUBRIC = '''Score each area 1-10. 5 means "competent but forgettable"; 8+ is reserved for work you would show off.
Be harsh: a game that merely runs is not good. Inflated scores are a failure of your job.
- novelty: what does this game do that a stock genre game does not? If the core loop is a stock pattern
  (run and jump to an exit, collect N items to unlock a door, dodge patrolling enemies, endless dodge-the-falling-thing)
  with no distinct mechanic that changes player decisions, novelty <= 3 and derivative = true. Name what it resembles.
- visual: if the player character or enemies are plain rectangles / circles / glowing boxes without a readable
  silhouette, outline, shading or animation, visual <= 3. Text labels standing in for art <= 2. Judge the screenshots,
  not the code's intentions; the measured code statistics tell you how much of the drawing is boxes and circles.
- feel: how controlling the character feels in the actual trajectories (responsiveness, momentum, jump control,
  camera). Stiff, floaty or unresponsive movement <= 4.
- feedback: what the game shows or plays back when something happens (hit, pickup, death, progress). Silent state
  changes <= 3.
- clarity: can a first-time player tell the goal and controls within a few seconds and read win / lose?
- depth: escalation, meaningful decisions, distinct enemy behaviour, reasons to replay.
Hard rules: runtime errors, a frozen screen (identical frames while keys are pressed) or a game that cannot be
progressed by keyboard make every area <= 2.'''

CRITIC_SHAPE = ('{"resembles":"the stock game / genre pattern this most resembles","derivative":true,'
                '"scores":{"novelty":1,"visual":1,"feel":1,"feedback":1,"clarity":1,"depth":1},'
                '"verdict":"one blunt sentence a lead designer would say",'
                '"issues":[{"severity":"critical|major|minor","area":"novelty|visual|feel|feedback|clarity|depth|stability",'
                '"problem":"what is wrong, concretely","evidence":"frame path, trajectory step or measured number","fix":"a concrete, '
                'actionable change: what to build and what it should look or feel like"}],'
                '"strengths":["at most three things worth keeping"]}')
