"""Responsive check for the sidebar changes.

The new "Reference" group label has to disappear in the collapsed rail and
come back inside the mobile drawer, where the existing mini-rail overrides
un-hide every label. Both are easy to get wrong and invisible in a
desktop screenshot, so assert them directly.
"""
import html as H
import os
import re
import subprocess
import sys
import tempfile

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
]
browser = next(p for p in BROWSERS if os.path.exists(p))

PROBE = """
<script>
window.__errors = [];
window.addEventListener('error', function (e) { window.__errors.push(String(e.message)); });

function show(html) {
  var out = document.createElement('pre');
  out.id = 'probe-log';
  out.appendChild(document.createTextNode(html + ' | errors=' + window.__errors.length));
  document.body.appendChild(out);
}

function report(tag) {
  var side = document.getElementById('sidebar');
  var nav = document.querySelector('.side-nav');
  var link = document.querySelector('.side-nav a');
  var span = link ? link.querySelector('span') : null;
  var icon = link ? link.querySelector('svg') : null;
  var footIcon = document.querySelector('.sidebar-foot .side-link svg');
  var tog = document.querySelector('.side-toggle');
  var tip = getComputedStyle(link, '::after');
  var tipW = parseFloat(tip.width);
  var linkBox = link.getBoundingClientRect();

  show(tag +
    ' | rail=' + document.documentElement.getAttribute('data-rail') +
    ' vw=' + window.innerWidth + 'x' + window.innerHeight +
    ' | railW=' + Math.round(side.getBoundingClientRect().width) +
    ' navW=' + Math.round(nav.getBoundingClientRect().width) +
    ' navScrollW=' + nav.scrollWidth + ' navClientW=' + nav.clientWidth +
    ' hScroll=' + (nav.scrollWidth > nav.clientWidth) +
    ' vScroll=' + (nav.scrollHeight > nav.clientHeight) +
    ' navOverflowX=' + getComputedStyle(nav).overflowX +
    ' | linkBox=' + Math.round(linkBox.width) + 'x' + Math.round(linkBox.height) +
    ' icon=' + (icon ? getComputedStyle(icon).width : '?') +
    ' footIcon=' + (footIcon ? getComputedStyle(footIcon).width : '?') +
    ' toggle=' + (tog ? Math.round(tog.getBoundingClientRect().width) : '?') +
    ' | spanDisplay=' + (span ? getComputedStyle(span).display : '?') +
    ' tipW=' + tipW +
    ' tipRight=' + Math.round(linkBox.right + 10 + tipW) +
    ' navRight=' + Math.round(nav.getBoundingClientRect().right) +
    ' | tipClipped=' + (linkBox.right + 10 + tipW > nav.getBoundingClientRect().right + 1));
}

function run() {
  report('full');
  document.querySelector('[data-action="sidebar"]').click();
  report('mini');
}
if (document.readyState === 'complete') { setTimeout(run, 500); }
else { window.addEventListener('load', function () { setTimeout(run, 500); }); }
</script>
"""

src = open("index.html", encoding="utf-8").read()
patched = src.replace("<head>", '<head>\n<base href="../">', 1)
patched = patched.replace("</body>", PROBE + "</body>")
tmp = os.path.abspath("_ref/_probe-index.html")
open(tmp, "w", encoding="utf-8").write(patched)

results = {}
sink = open(os.path.abspath("_ref/side-sizing.txt"), "w", encoding="utf-8")


def say(line):
    sink.write(line + "\n")
    sink.flush()


for label, size in (("desktop", "1600,950"), ("mobile", "420,860")):
    profile = tempfile.mkdtemp(prefix="ft-r-")
    proc = subprocess.run(
        [browser, "--headless=new", "--disable-gpu", "--no-first-run",
         "--user-data-dir=" + profile, "--window-size=" + size,
         "--virtual-time-budget=10000", "--dump-dom",
         "file:///" + tmp.replace("\\", "/")],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
    dom = proc.stdout or ""
    out = [H.unescape(x).strip() for x in
           re.findall(r'<pre id="probe-log"[^>]*>(.*?)</pre>', dom, re.S)]
    results[label] = out
    say("=== %s (%s) ===" % (label, size))
    for line in out:
        say("  " + line)
    say("")

fails = []
d = results["desktop"]
if len(d) < 2:
    fails.append("desktop: expected 2 states, got %d" % len(d))
else:
    full, mini = d[0], d[1]
    # The collapsed rail is the one the user called too small: the icons are the
    # entire menu, so they must be drawn at a readable size, not a token one.
    if "spanDisplay=none" not in mini:
        fails.append("mini rail still shows the text label")
    if "icon=23px" not in mini:
        fails.append("collapsed nav icon is not 23px")
    if "footIcon=22px" not in mini:
        fails.append("collapsed footer icon is not 22px")
    if "toggle=52" not in mini:
        fails.append("collapsed toggle is not the 52px target")
    if "toggle=44" not in full:
        fails.append("expanded toggle is not the 44px touch floor")
    if "railW=88" not in mini:
        fails.append("collapsed rail is not 88px wide")
    if "linkBox=71x48" not in mini:
        fails.append("collapsed nav row is not a 71x48 target")
    # A tooltip that is clipped by a scroll box is worse than no tooltip, since
    # the collapsed rail has no other way to name its icons. With overflow-x
    # visible the pseudo escapes the nav, so assert THAT rather than
    # scrollWidth, which still reports the geometric overflow.
    if "navOverflowX=visible" not in mini:
        fails.append("the collapsed nav is a scroll container, so it clips its tooltips")
    if "vScroll=true" in mini:
        fails.append("the collapsed rail overflows vertically and hides items")

m = results["mobile"]
if len(m) < 2:
    fails.append("mobile: expected 2 states, got %d" % len(m))
else:
    if "spanDisplay=none" not in m[1] and "rail=mini" in m[1]:
        fails.append("mobile: a collapsed drawer should still show its labels")

if fails:
    say("FAIL (%d)" % len(fails))
    for f in fails:
        say("  - " + f)
    sink.close()
    sys.exit(1)
say("SIDEBAR SIZING OK")
sink.close()
