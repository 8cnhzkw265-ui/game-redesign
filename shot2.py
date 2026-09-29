"""Screenshot the app at a given size, with an optional setup step injected.

Usage:  py _ref/shot2.py <route> <w> <h> <out.png> [mode]
where mode is one of: none | mini | drawer | light | dark | lightmini | darkmini

NOTE: run one size at a time. Every invocation rewrites the same
_ref/_shot-index.html staging file, so two concurrent runs race and the second
one wins for both outputs.
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
mode = sys.argv[5] if len(sys.argv) > 5 else "none"

# base.css puts a 200ms transition on body's colour. Under headless virtual time
# that transition never settles, so a mode flip leaves every element that
# INHERITS body colour (player names, turn dots) painted in the old palette.
# Kill the transition first, then flip.
NO_TRANS = ("var s=document.createElement('style');"
            "s.textContent='body{transition:none !important}';"
            "document.head.appendChild(s);")
FLIP = "document.documentElement.setAttribute('data-mode','%s');"
COLLAPSE = "document.querySelector('[data-action=\"sidebar\"]').click();"

SETUP = {
    "mini": COLLAPSE,
    "drawer": COLLAPSE,
    "minitip": ("var s=document.createElement('style');"
                "s.textContent='.tip::after{opacity:1 !important}';"
                "document.head.appendChild(s);" + COLLAPSE),
    "light": NO_TRANS + (FLIP % "light"),
    "dark": NO_TRANS + (FLIP % "dark"),
    "lightmini": NO_TRANS + (FLIP % "light") + COLLAPSE,
    "darkmini": NO_TRANS + (FLIP % "dark") + COLLAPSE,
}.get(mode, "")

inject = ("<script>window.addEventListener('load',function(){setTimeout(function(){%s},300);});"
          "</script>" % SETUP) if SETUP else ""

src = open("index.html", encoding="utf-8").read()
patched = src.replace("<head>", '<head>\n<base href="../">', 1)
patched = patched.replace("</body>", inject + "</body>")
tmp = os.path.abspath("_ref/_shot-index.html")
open(tmp, "w", encoding="utf-8").write(patched)

profile = tempfile.mkdtemp(prefix="ft-shot-")
subprocess.run(
    [browser, "--headless=new", "--disable-gpu", "--hide-scrollbars",
     "--no-first-run", "--user-data-dir=" + profile,
     "--window-size=%s,%s" % (w, h), "--virtual-time-budget=9000",
     "--screenshot=" + os.path.abspath(out), "file:///" + tmp.replace("\\", "/")],
    capture_output=True, text=True, timeout=180)
print("wrote", out, os.path.exists(out))
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
mode = sys.argv[5] if len(sys.argv) > 5 else "none"

SETUP = {
    "mini": "document.querySelector('[data-action=\"sidebar\"]').click();",
    "drawer": "document.querySelector('[data-action=\"sidebar\"]').click();",
    "minitip": ("var s=document.createElement('style');"
                "s.textContent='.tip::after{opacity:1 !important}';"
                "document.head.appendChild(s);"
                "document.querySelector('[data-action=\"sidebar\"]').click();"),
    # base.css puts a 200ms transition on body's colour. Under headless virtual
    # time that transition never settles, so a mode flip leaves every element
    # that INHERITS body colour (player names, turn dots) painted in the old
    # palette. Kill the transition first, then flip.
    "light": ("var s=document.createElement('style');"
              "s.textContent='body{transition:none !important}';"
              "document.head.appendChild(s);"
              "document.documentElement.setAttribute('data-mode','light');"),
    "dark": ("var s=document.createElement('style');"
             "s.textContent='body{transition:none !important}';"
             "document.head.appendChild(s);"
             "document.documentElement.setAttribute('data-mode','dark');"),
    "lightmini": ("var s=document.createElement('style');"
                  "s.textContent='body{transition:none !important}';"
                  "document.head.appendChild(s);"
                  "document.documentElement.setAttribute('data-mode','light');"
                  "document.querySelector('[data-action=\"sidebar\"]').click();"),
    "darkmini": ("var s=document.createElement('style');"
                 "s.textContent='body{transition:none !important}';"
                 "document.head.appendChild(s);"
                 "document.documentElement.setAttribute('data-mode','dark');"
                 "document.querySelector('[data-action=\"sidebar\"]').click();"),
}[mode] if mode in ("mini", "drawer", "minitip", "light", "dark", "lightmini", "darkmini") else ""

inject = ("<script>window.addEventListener('load',function(){setTimeout(function(){%s},300);});"
          "</script>" % SETUP) if SETUP else ""

src = open("index.html", encoding="utf-8").read()
patched = src.replace("<head>", '<head>\n<base href="../">', 1)
patched = patched.replace("</body>", inject + "</body>")
tmp = os.path.abspath("_ref/_shot-index.html")
open(tmp, "w", encoding="utf-8").write(patched)

profile = tempfile.mkdtemp(prefix="ft-shot-")
subprocess.run(
    [browser, "--headless=new", "--disable-gpu", "--hide-scrollbars",
     "--no-first-run", "--user-data-dir=" + profile,
     "--window-size=%s,%s" % (w, h), "--virtual-time-budget=9000",
     "--screenshot=" + os.path.abspath(out), "file:///" + tmp.replace("\\", "/")],
    capture_output=True, text=True, timeout=180)
print("wrote", out, os.path.exists(out))
