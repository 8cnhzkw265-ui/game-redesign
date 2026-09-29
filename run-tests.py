"""Run tests/<name>.html in headless and write what it printed to a text file.

Usage:  py _ref/run-tests.py app-test [engine-test]
Results land in _ref/<name>-result.txt.
"""
import os
import re
import subprocess
import sys
import tempfile

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
]
browser = next(p for p in BROWSERS if os.path.exists(p))

name = sys.argv[1] if len(sys.argv) > 1 else "app-test"
page = os.path.abspath("tests/%s.html" % name)
profile = tempfile.mkdtemp(prefix="ft-test-")
proc = subprocess.run(
    [browser, "--headless=new", "--disable-gpu", "--no-first-run",
     "--user-data-dir=" + profile, "--virtual-time-budget=9000", "--dump-dom",
     "file:///" + page.replace("\\", "/")],
    capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
dom = proc.stdout or ""

body = re.sub(r"<script.*?</script>", " ", dom, flags=re.S)
body = re.sub(r"<style.*?</style>", " ", body, flags=re.S)
body = re.sub(r"<[^>]+>", " ", body)
body = re.sub(r"\s+", " ", body).strip()
dest = os.path.abspath("_ref/%s-result.txt" % name)
open(dest, "w", encoding="utf-8").write(body)
print("wrote " + dest + "  (%d chars)" % len(body))
