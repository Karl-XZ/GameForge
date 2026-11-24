"""Run inside Linux/WSL, from the repository root, as the worker user."""
import os
from pathlib import Path
import subprocess
import sys
if sys.platform!='linux' or os.getuid()==0:
    raise SystemExit('Use a non-root Linux/WSL user with Docker access. See docs/IMPROVEMENT.md')
root=Path(__file__).resolve().parents[1]
subprocess.run(['docker','info'],check=True,stdout=subprocess.DEVNULL)
subprocess.run([sys.executable,'-m','pip','install','-r',str(root/'worker/requirements.txt')],check=True)
subprocess.run(['docker','build','-t','gameforge/runtime:html-v1','-f','worker/Dockerfile','.'],cwd=root,check=True)
print('Worker prerequisites ready')
