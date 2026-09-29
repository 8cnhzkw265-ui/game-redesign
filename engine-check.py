"""Read the engine test result out of tests/engine-test.html.

That page reports into <pre id="out">, not the #test-log element
_ref/runbrowser.py looks for, so grep the dump directly.
"""
import html as H
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
profile = tempfile.mkdtemp(prefix="ft-eng-")
dom = subprocess.run(
    [browser, "--headless=new", "--disable-gpu", "--no-first-run",
     "--user-data-dir=" + profile, "--virtual-time-budget=120000", "--dump-dom",
     "file:///c:/strategy%20game/tests/engine-test.html"],
    capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=240).stdout or ""

m = re.search(r'<pre id="out"[^>]*>(.*?)</pre>', dom, re.S)
if not m:
    print("FAIL: the engine test never wrote a result")
    sys.exit(1)
text = H.unescape(m.group(1)).strip()
print(text)
open("_ref/engine-result.txt", "w", encoding="utf-8").write(text)

low = text.lower()
if "fail" in low or "error" in low:
    print("\nENGINE: FAILED")
    sys.exit(1)
if "all" not in low and "pass" not in low:
    print("\nENGINE: inconclusive")
    sys.exit(1)
print("\nENGINE: OK")
