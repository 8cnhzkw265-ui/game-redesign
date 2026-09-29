"""Measure the new cockpit geometry and name whatever overflows the right rail.

Run:  py _ref/layout-probe.py
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

PROBE = """
<script>
window.__errors = [];
window.addEventListener('error', function (e) { window.__errors.push(String(e.message)); });

function box(sel) {
  var el = document.querySelector(sel);
  if (!el) return sel + '=MISSING';
  var r = el.getBoundingClientRect();
  return sel + '=' + Math.round(r.left) + '..' + Math.round(r.right) +
         ' w' + Math.round(r.width) + ' h' + Math.round(r.height);
}

function run() {
  var out = [];
  out.push(box('.shell-main'));
  out.push(box('#view-play .wrap'));
  out.push(box('.play-layout'));
  out.push(box('.cockpit'));
  out.push(box('.board-frame'));
  out.push(box('.board-frame .stage'));
  out.push(box('.stage-svg'));
  out.push(box('.rail-right'));
  out.push(box('#sidebar'));

  var rail = document.querySelector('.rail-right');
  out.push('rail clientW=' + rail.clientWidth + ' scrollW=' + rail.scrollWidth +
           ' overflowX=' + getComputedStyle(rail).overflowX);

  // Which children are wider than the rail they sit in?
  var limit = rail.getBoundingClientRect().right;
  var bad = [];
  Array.prototype.forEach.call(rail.children, function (c) {
    var r = c.getBoundingClientRect();
    if (r.right > limit + 1 || r.width > rail.clientWidth + 1) {
      bad.push(c.className.split(' ')[0] + '(w' + Math.round(r.width) +
              ',right' + Math.round(r.right) + ',minW' + getComputedStyle(c).minWidth + ')');
    }
  });
  out.push('OVERFLOWING: ' + (bad.length ? bad.join(' ') : 'none'));

  // Widest leaf inside the rail, to find the nowrap culprit.
  var widest = [];
  Array.prototype.forEach.call(rail.querySelectorAll('*'), function (c) {
    var r = c.getBoundingClientRect();
    if (r.width > rail.clientWidth - 8) {
      var cs = getComputedStyle(c);
      widest.push(c.tagName + '.' + (c.className || '-') + '(w' + Math.round(r.width) +
                  ',ws=' + cs.whiteSpace + ',flex=' + cs.flex + ')');
    }
  });
  out.push('WIDE: ' + (widest.slice(0, 6).join(' | ') || 'none'));

  out.push('errors=' + window.__errors.length);
  var pre = document.createElement('pre');
  pre.id = 'probe-log';
  pre.textContent = out.join('\\n');
  document.body.appendChild(pre);
}
if (document.readyState === 'complete') { setTimeout(run, 600); }
else { window.addEventListener('load', function () { setTimeout(run, 600); }); }
</script>
"""

src = open("index.html", encoding="utf-8").read()
patched = src.replace("<head>", '<head>\n<base href="../">', 1)
patched = patched.replace("</body>", PROBE + "</body>")
tmp = os.path.abspath("_ref/_probe-layout.html")
open(tmp, "w", encoding="utf-8").write(patched)

for label, size in (("desktop 1600x900", "1600,900"), ("wide 1920x1080", "1920,1080")):
    profile = tempfile.mkdtemp(prefix="ft-l-")
    proc = subprocess.run(
        [browser, "--headless=new", "--disable-gpu", "--no-first-run",
         "--user-data-dir=" + profile, "--window-size=" + size,
         "--virtual-time-budget=10000", "--dump-dom",
         "file:///" + tmp.replace("\\", "/")],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
    dom = proc.stdout or ""
    log = re.search(r'<pre id="probe-log"[^>]*>(.*?)</pre>', dom, re.S)
    print("=== %s ===" % label)
    print(H.unescape(log.group(1)).strip() if log else "(no probe output)")
    print()
