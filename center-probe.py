"""Verify the board hexes are centred inside the stage and the cockpit column.

Usage:  py _ref/center-probe.py <label> <width> <height>
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

PROBE = r"""
<script>
window.__errors = [];
window.addEventListener('error', function (e) { window.__errors.push(String(e.message)); });

function run() {
  var out = [];
  var stage = document.querySelector('.board-frame .stage');
  var svg = document.querySelector('.stage-svg');
  var cockpit = document.querySelector('.cockpit');
  var rail = document.querySelector('.rail-right');
  var side = document.getElementById('sidebar');

  // Union bounding box of the rendered hexes = the board as the eye sees it.
  var hexes = document.querySelectorAll('.b-hex');
  var minL = Infinity, maxR = -Infinity, minT = Infinity, maxB = -Infinity;
  Array.prototype.forEach.call(hexes, function (h) {
    var r = h.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    minL = Math.min(minL, r.left); maxR = Math.max(maxR, r.right);
    minT = Math.min(minT, r.top);  maxB = Math.max(maxB, r.bottom);
  });

  function mid(a, b) { return (a + b) / 2; }

  out.push('hexes=' + hexes.length);
  if (hexes.length) {
    var bcx = mid(minL, maxR), bcy = mid(minT, maxB);
    var scx = mid(stage.getBoundingClientRect().left, stage.getBoundingClientRect().right);
    var scy = mid(stage.getBoundingClientRect().top, stage.getBoundingClientRect().bottom);
    var ccx = mid(cockpit.getBoundingClientRect().left, cockpit.getBoundingClientRect().right);
    out.push('board  L' + Math.round(minL) + ' R' + Math.round(maxR) +
             ' T' + Math.round(minT) + ' B' + Math.round(maxB) +
             ' W' + Math.round(maxR - minL) + ' H' + Math.round(maxB - minT));
    out.push('board centre x=' + Math.round(bcx) + ' y=' + Math.round(bcy));
    out.push('stage centre x=' + Math.round(scx) + ' y=' + Math.round(scy));
    out.push('cockpit centre x=' + Math.round(ccx));
    out.push('OFFSET vs stage  dx=' + Math.round(bcx - scx) +
             ' dy=' + Math.round(bcy - scy) + '   (0,0 = perfectly centred)');
    out.push('OFFSET vs cockpit dx=' + Math.round(bcx - ccx));
    out.push('BOARD_IS_CENTRED=' + (Math.abs(bcx - scx) <= 2 ? 'yes' : 'NO'));
  }
  out.push('svg viewBox=' + svg.getAttribute('viewBox') +
           ' par=' + svg.getAttribute('preserveAspectRatio'));
  // Gaps the eye reads as balance.
  var rr = rail.getBoundingClientRect(), sr = side.getBoundingClientRect();
  out.push('gap board|rail = ' + Math.round(rr.left - stage.getBoundingClientRect().right) + 'px');
  out.push('gap rail|nav   = ' + Math.round(sr.left - rr.right) + 'px' +
           '  (nav starts ' + Math.round(sr.left) + ', rail ends ' + Math.round(rr.right) + ')');
  out.push('RAIL_CLEARS_NAV=' + (rr.right <= sr.left + 1 ? 'yes' : 'NO'));
  out.push('errors=' + window.__errors.length);
  var pre = document.createElement('pre');
  pre.id = 'probe-log';
  pre.textContent = out.join('\n');
  document.body.appendChild(pre);
}
if (document.readyState === 'complete') { setTimeout(run, 700); }
else { window.addEventListener('load', function () { setTimeout(run, 700); }); }
</script>
"""

src = open("index.html", encoding="utf-8").read()
patched = src.replace("<head>", '<head>\n<base href="../">', 1)
patched = patched.replace("</body>", PROBE + "</body>")
tmp = os.path.abspath("_ref/_probe-center.html")
open(tmp, "w", encoding="utf-8").write(patched)

label = sys.argv[1] if len(sys.argv) > 1 else "d"
w = sys.argv[2] if len(sys.argv) > 2 else "1600"
h = sys.argv[3] if len(sys.argv) > 3 else "900"

profile = tempfile.mkdtemp(prefix="ft-center-")
proc = subprocess.run(
    [browser, "--headless=new", "--disable-gpu", "--no-first-run",
     "--user-data-dir=" + profile, "--window-size=" + w + "," + h,
     "--virtual-time-budget=7000", "--dump-dom",
     "file:///" + tmp.replace("\\", "/")],
    capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)

dom = proc.stdout or ""
log = re.search(r'<pre id="probe-log"[^>]*>(.*?)</pre>', dom, re.S)
text = H.unescape(log.group(1)).strip() if log else "(no probe output)"
dest = os.path.abspath("_ref/center-%s.txt" % label)
open(dest, "w", encoding="utf-8").write(text + "\n")
print("wrote " + dest)
