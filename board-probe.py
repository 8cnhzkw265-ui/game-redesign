"""Measure the board: is it clipped, is it centred, how big is it?

Usage:  py _ref/board-probe.py [w] [h] ...
Results are written to _ref/board-probe.txt (stdout may be flaky).
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

function rect(sel) {
  var el = document.querySelector(sel);
  if (!el) return sel + '=MISSING';
  var r = el.getBoundingClientRect();
  return Math.round(r.left) + '..' + Math.round(r.right) +
         ' w' + Math.round(r.width) + ' h' + Math.round(r.height) +
         ' T' + Math.round(r.top) + ' B' + Math.round(r.bottom);
}

function run() {
  var out = [];
  out.push('viewport=' + window.innerWidth + 'x' + window.innerHeight);
  out.push('docScrollW=' + document.documentElement.scrollWidth);

  var stage = document.querySelector('#view-play .stage');
  var svg = document.querySelector('#board');
  var root = svg.querySelector('g');
  var cs = getComputedStyle(svg);
  var scs = getComputedStyle(stage);

  out.push('stage      ' + rect('#view-play .stage'));
  out.push('stage pad  ' + scs.paddingTop + '/' + scs.paddingBottom + ' overflow=' + scs.overflow);
  out.push('svg box    ' + rect('#board'));
  out.push('svg css    h=' + cs.height + ' maxH=' + cs.maxHeight + ' minH=' + cs.minHeight +
           ' w=' + cs.width + ' flex=' + cs.flex);
  out.push('viewBox    ' + svg.getAttribute('viewBox') +
           ' par=' + svg.getAttribute('preserveAspectRatio'));

  // Rendered content box of the hex grid (after the viewBox transform).
  var g = root.getBoundingClientRect();
  var vb = svg.viewBox.baseVal;
  var sx = svg.clientWidth / vb.width, sy = svg.clientHeight / vb.height;
  var fit = Math.min(sx, sy);
  out.push('svg client ' + svg.clientWidth + 'x' + svg.clientHeight +
           ' scale=' + fit.toFixed(3) +
           ' letterboxX=' + Math.round((svg.clientWidth - vb.width * fit) / 2) +
           ' letterboxY=' + Math.round((svg.clientHeight - vb.height * fit) / 2));

  var sr = stage.getBoundingClientRect();
  var clipTop = Math.round(sr.top - g.top);
  var clipBot = Math.round(g.bottom - sr.bottom);
  out.push('content    ' + Math.round(g.left) + '..' + Math.round(g.right) +
           ' h' + Math.round(g.height) + ' T' + Math.round(g.top) + ' B' + Math.round(g.bottom));
  out.push('CLIP top=' + clipTop + ' bottom=' + clipBot +
           '  => ' + (clipTop > 1 || clipBot > 1 ? 'CLIPPED' : 'fits'));

  // Does any bar sit on top of a rendered hex?
  ['.player-top', '.player-bottom', '.board-chrome', '.action-bar'].forEach(function (sel) {
    var b = document.querySelector(sel);
    if (!b) return;
    var br = b.getBoundingClientRect();
    var ox = Math.min(br.right, g.right) - Math.max(br.left, g.left);
    var oy = Math.min(br.bottom, g.bottom) - Math.max(br.top, g.top);
    out.push('overlap ' + sel + ' = ' + (ox > 1 && oy > 1 ? 'YES ' + Math.round(ox) + 'x' + Math.round(oy) : 'no'));
  });

  // --- the two floating identity cards: are they saying everything? ----------
  ['.player-top', '.player-bottom'].forEach(function (sel) {
    var s = document.querySelector(sel);
    if (!s) return;
    var sr = s.getBoundingClientRect();
    out.push(sel + ' T' + Math.round(sr.top) + ' B' + Math.round(sr.bottom) +
             ' h' + Math.round(sr.height) + ' pos=' + getComputedStyle(s).position);
    s.querySelectorAll('*').forEach(function (n) {
      if (n.children.length) return;
      var nr = n.getBoundingClientRect();
      var nc = getComputedStyle(n);
      out.push('   [' + (n.className || n.id || n.tagName) + '] "' +
               (n.textContent || '').trim().slice(0, 28) + '" w' +
               Math.round(nr.width) + ' h' + Math.round(nr.height) +
               ' disp=' + nc.display + ' color=' + nc.color + ' vis=' + nc.visibility);
    });
  });

  out.push('mode=' + document.documentElement.getAttribute('data-mode') +
           ' text1=' + getComputedStyle(document.documentElement)
             .getPropertyValue('--text-1'));
  var walk = document.querySelector('.player-name');
  while (walk && walk !== document.documentElement) {
    var wc = getComputedStyle(walk);
    out.push('  chain ' + walk.tagName + '.' + (walk.className || '-') +
             ' color=' + wc.color + ' rule-inline=' + (walk.getAttribute('style') || 'none'));
    walk = walk.parentElement;
  }

  // Centring inside the cockpit column.
  var cock = document.querySelector('.cockpit').getBoundingClientRect();
  var mid = (cock.left + cock.right) / 2;
  out.push('cockpit mid=' + Math.round(mid) +
           ' content mid=' + Math.round((g.left + g.right) / 2) +
           ' dx=' + Math.round((g.left + g.right) / 2 - mid));

  // Smallest hex on screen (touch target).
  var cell = svg.querySelector('.b-hex .cell');
  var cr = cell.getBoundingClientRect();
  out.push('one hex    w' + Math.round(cr.width) + ' h' + Math.round(cr.height));

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
tmp = os.path.abspath("_ref/_probe-board.html")
open(tmp, "w", encoding="utf-8").write(patched)

# FORCE_MODE=<dark|light> pins the material so the probe reports a known palette.
force = os.environ.get("FORCE_MODE")
if force:
    pin = ("<script>window.addEventListener('load',function(){"
           "document.documentElement.setAttribute('data-mode','%s');});</script>" % force)
    open(tmp, "w", encoding="utf-8").write(
        patched.replace("</body>", pin + "</body>"))

sizes = sys.argv[1:] or ["1600,900", "1920,1080", "1280,900", "1100,900", "560,900"]

blocks = []
for size in sizes:
    profile = tempfile.mkdtemp(prefix="ft-b-")
    proc = subprocess.run(
        [browser, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
         "--user-data-dir=" + profile, "--window-size=" + size,
         "--virtual-time-budget=9000", "--dump-dom",
         "file:///" + tmp.replace("\\", "/")],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
    dom = proc.stdout or ""
    log = re.search(r'<pre id="probe-log"[^>]*>(.*?)</pre>', dom, re.S)
    blocks.append("=== %s ===\n%s" % (size, H.unescape(log.group(1)).strip() if log else "(no probe output)"))

text = "\n\n".join(blocks)
dest = os.path.abspath("_ref/board-probe.txt")
open(dest, "w", encoding="utf-8").write(text + "\n")
print("wrote " + dest)
