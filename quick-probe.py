"""Fast geometry probe: one browser run per size, results written to disk.

Usage:  py _ref/quick-probe.py <label> <width> <height>
Writes _ref/quick-<label>.txt so the output survives flaky console capture.
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

function box(sel) {
  var el = document.querySelector(sel);
  if (!el) return sel + '=MISSING';
  var r = el.getBoundingClientRect();
  return sel + ' L' + Math.round(r.left) + ' R' + Math.round(r.right) +
         ' W' + Math.round(r.width) + ' H' + Math.round(r.height);
}

function run() {
  var out = [];
  out.push('viewport=' + window.innerWidth + 'x' + window.innerHeight +
           ' rail=' + (document.documentElement.getAttribute('data-rail') || '?'));
  out.push('docScrollW=' + document.documentElement.scrollWidth +
           ' bodyScrollW=' + document.body.scrollWidth);
  out.push(box('.shell'));
  out.push(box('.shell-main'));
  out.push(box('#view-play .wrap'));
  out.push(box('.play-layout'));
  out.push(box('.cockpit'));
  out.push(box('.board-frame'));
  out.push(box('.stage'));
  out.push(box('.stage-svg'));
  out.push(box('.rail-right'));
  out.push(box('#sidebar'));

  var rail = document.querySelector('.rail-right');
  out.push('rail clientW=' + rail.clientWidth + ' scrollW=' + rail.scrollWidth);

  // Direct children that stick out past the rail's right edge.
  var limit = rail.getBoundingClientRect().right;
  var bad = [];
  Array.prototype.forEach.call(rail.children, function (c) {
    var r = c.getBoundingClientRect();
    if (r.right > limit + 1) {
      bad.push(c.className.split(' ')[0] + '(R' + Math.round(r.right) + ',W' +
              Math.round(r.width) + ',minW' + getComputedStyle(c).minWidth + ')');
    }
  });
  out.push('RAIL_OVERFLOW: ' + (bad.length ? bad.join(' ') : 'none'));

  // Deepest offenders: any descendant whose right edge passes the rail edge.
  var deep = [];
  Array.prototype.forEach.call(rail.querySelectorAll('*'), function (c) {
    var r = c.getBoundingClientRect();
    if (r.right > limit + 1) {
      var cs = getComputedStyle(c);
      deep.push(c.tagName + '.' + (c.className || '-') + '(R' + Math.round(r.right) +
                ',ws=' + cs.whiteSpace + ')');
    }
  });
  out.push('DEEP_OVERFLOW(' + deep.length + '): ' + deep.slice(0, 8).join(' | '));

  // Anything on the whole page wider than the viewport.
  var pageBad = [];
  Array.prototype.forEach.call(document.querySelectorAll('body *'), function (c) {
    var r = c.getBoundingClientRect();
    if (r.width > 0 && r.right > window.innerWidth + 1) {
      pageBad.push(c.tagName + '.' + (typeof c.className === 'string' ?
                c.className.split(' ')[0] : '-') + '(R' + Math.round(r.right) + ')');
    }
  });
  out.push('PAGE_OVERFLOW(' + pageBad.length + '): ' + pageBad.slice(0, 10).join(' | '));

  out.push('errors=' + window.__errors.length);
  var pre = document.createElement('pre');
  pre.id = 'probe-log';
  pre.textContent = out.join('\n');
  document.body.appendChild(pre);
}
if (document.readyState === 'complete') { setTimeout(run, 500); }
else { window.addEventListener('load', function () { setTimeout(run, 500); }); }
</script>
"""

src = open("index.html", encoding="utf-8").read()
patched = src.replace("<head>", '<head>\n<base href="../">', 1)
patched = patched.replace("</body>", PROBE + "</body>")
tmp = os.path.abspath("_ref/_probe-quick.html")
open(tmp, "w", encoding="utf-8").write(patched)

label = sys.argv[1] if len(sys.argv) > 1 else "d"
w = sys.argv[2] if len(sys.argv) > 2 else "1600"
h = sys.argv[3] if len(sys.argv) > 3 else "900"

profile = tempfile.mkdtemp(prefix="ft-q-")
proc = subprocess.run(
    [browser, "--headless=new", "--disable-gpu", "--no-first-run",
     "--user-data-dir=" + profile, "--window-size=" + w + "," + h,
     "--virtual-time-budget=6000", "--dump-dom",
     "file:///" + tmp.replace("\\", "/")],
    capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)

dom = proc.stdout or ""
log = re.search(r'<pre id="probe-log"[^>]*>(.*?)</pre>', dom, re.S)
text = H.unescape(log.group(1)).strip() if log else "(no probe output)"

dest = os.path.abspath("_ref/quick-%s.txt" % label)
open(dest, "w", encoding="utf-8").write(text + "\n")
print("wrote " + dest)
