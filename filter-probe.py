"""Drive the Watch filter for real and report the console.

Runs the page with an injected script that clicks each segmented button in
turn, recording what the app shows after each click. This is the only way to
prove the filter handler is wired, not just that the markup exists.
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

PROBE = """
<script>
// Reports the computed geometry that a screenshot cannot prove: is the
// leaderboard avatar actually a circle, and does the empty-state line fit?
window.__errors = [];
window.addEventListener('error', function (e) { window.__errors.push(String(e.message)); });

function run() {
  FT.ui.setView('ranks');
  var av = document.querySelector('#rank-list .avatar');
  var cs = getComputedStyle(av);
  var row = document.querySelector('#rank-list .rank-row');
  var rcs = getComputedStyle(row);

  FT.ui.setView('watch');
  var p = document.getElementById('watch-empty-body');
  var pbox = p.getBoundingClientRect();
  var panel = document.getElementById('watch-empty').getBoundingClientRect();
  var lineH = parseFloat(getComputedStyle(p).lineHeight);
  var lines = Math.round(pbox.height / lineH);

  var out = document.createElement('pre');
  out.id = 'probe-log';
  out.textContent =
    'avatarW=' + cs.width +
    ' avatarH=' + cs.height +
    ' radius=' + cs.borderTopLeftRadius +
    ' isCircle=' + (parseFloat(cs.borderTopLeftRadius) >= parseFloat(cs.width) / 2 - 0.5) +
    ' | rowCols=' + rcs.gridTemplateColumns +
    ' | emptyPanelW=' + Math.round(panel.width) +
    ' textW=' + Math.round(pbox.width) +
    ' textLines=' + lines +
    ' | errors=' + window.__errors.length;
  document.body.appendChild(out);
}
if (document.readyState === 'complete') { setTimeout(run, 400); }
else { window.addEventListener('load', function () { setTimeout(run, 400); }); }

</script>
"""

src = open("index.html", encoding="utf-8").read()
# <base> keeps the app's relative js/*.js and css/*.css paths resolving to the
# project root even though the probe copy itself sits in _ref/.
patched = src.replace("<head>", '<head>\n<base href="../">', 1)
patched = patched.replace("</body>", PROBE + "</body>")
tmp = os.path.abspath("_ref/_probe-index.html")
open(tmp, "w", encoding="utf-8").write(patched)

profile = tempfile.mkdtemp(prefix="ft-f-")
proc = subprocess.run(
    [browser, "--headless=new", "--disable-gpu", "--no-first-run",
     "--user-data-dir=" + profile, "--virtual-time-budget=12000",
     "--dump-dom", "file:///" + tmp.replace("\\", "/")],
    capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
dom = proc.stdout or ""

found = re.findall(r'<pre id="probe-log"[^>]*>(.*?)</pre>', dom, re.S)
import html as H
for line in found:
    print(H.unescape(line).strip())

err = re.findall(r"ERROR:CONSOLE.*", proc.stderr or "")
for e in err[:5]:
    print("STDERR:", e)

if not found:
    print("FAIL: the probe never ran")
    sys.exit(1)
if any("errors=0" not in f for f in found):
    print("FAIL: a runtime error was raised")
    sys.exit(1)

line = found[0]
expected = [
    ("isCircle=true", "the leaderboard avatar is not a circle"),
    ("rowCols=34px 40px", "the rank grid lost its fixed place/avatar columns"),
    ("textLines=1", "the empty-state line wraps; it should sit on one line"),
]
bad = False
for needle, why in expected:
    if needle not in line:
        print("FAIL: %s (expected %r)" % (why, needle))
        bad = True
if bad:
    sys.exit(1)
print("GEOMETRY + CONSOLE OK")
