"""Snapshot the validated environment, preserving the Windows-only dependency."""
import subprocess
from pathlib import Path
import sys
root = Path(__file__).resolve().parents[1]
pins = subprocess.check_output([sys.executable, "-m", "pip", "freeze"], text=True)
pins = pins.replace("pywin32==312", 'pywin32==312; sys_platform == "win32"')
(root / "backend/requirements.lock.txt").write_text(
    "# Validated Python 3.12 environment. Direct dependencies: requirements.txt\n" + pins, encoding="utf-8")
print("Backend environment lock written.")
