"""Screenshot routes with headless Edge/Chrome.

Usage:  py _ref/shot.py <route> <width> <height> <outfile>
"""
import os
import subprocess
import sys
import tempfile

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
]
browser = next(p for p in BROWSERS if os.path.exists(p))

route, w, h, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
profile = tempfile.mkdtemp(prefix="ft-shot-")
url = "file:///c:/strategy%20game/index.html" + route
cmd = [browser, "--headless=new", "--disable-gpu", "--hide-scrollbars",
       "--no-first-run", "--no-default-browser-check",
       "--user-data-dir=" + profile,
       "--window-size=%s,%s" % (w, h),
       "--virtual-time-budget=9000",
       "--screenshot=" + os.path.abspath(out), url]
subprocess.run(cmd, capture_output=True, text=True, timeout=180)
print("wrote", out, os.path.exists(out))
