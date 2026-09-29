"""Final regression sweep: every route still boots and renders.

Confirms the two new views did not break the five that already existed, that
the board still paints, and that a fresh session logs no console errors.
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

import sys

ROUTES = sys.argv[1:] or ["play", "watch", "ranks", "themes", "system", "rules", "mobile"]
BASE = "file:///c:/strategy%20game/index.html"

fails = []
# Write straight to disk as we go: seven headless boots outrun the shell
# capture window, and a partial sweep is still worth reading.
sink = open(os.path.abspath("_ref/routes-%s.txt" % ROUTES[0]), "w", encoding="utf-8")


def say(line):
    sink.write(line + "\n")
    sink.flush()


for route in ROUTES:
    profile = tempfile.mkdtemp(prefix="ft-rg-")
    proc = subprocess.run(
        [browser, "--headless=new", "--disable-gpu", "--no-first-run",
         "--user-data-dir=" + profile, "--virtual-time-budget=9000", "--dump-dom",
         BASE + "#" + route],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
    dom = proc.stdout or ""
    active = 'id="view-%s" aria-label' % route in dom and \
        re.search(r'<section class="view is-active" id="view-%s"' % route, dom)
    cells = len(re.findall(r'class="b-hex', dom))
    pieces = len(re.findall(r'class="p-piece', dom))
    theme_cards = len(re.findall(r'class="theme-card', dom))
    console = [l for l in (proc.stderr or "").splitlines()
               if "ERROR:CONSOLE" in l or "Uncaught" in l]
    ok = bool(active) and not console
    say("%-8s active=%-5s hex=%-4s pieces=%-4s cards=%-4s console=%d  %s"
        % (route, bool(active), cells, pieces, theme_cards, len(console),
           "OK" if ok else "FAIL"))
    if not active:
        fails.append("%s: the view never became active" % route)
    if console:
        fails.append("%s: console errors: %s" % (route, console[:2]))
    if route in ("play", "mobile") and cells < 100:
        fails.append("%s: only %d board cells painted" % (route, cells))
    if route == "ranks" and 'class="rank-row' not in dom:
        fails.append("ranks: the leaderboard did not render")
    if route == "watch" and 'id="watch-empty"' not in dom:
        fails.append("watch: the empty state is missing")
    if route in ("themes",) and theme_cards == 0:
        fails.append("themes: the library cards did not render")

say("")
if fails:
    say("FAIL (%d)" % len(fails))
    for f in fails:
        say("  - " + f)
    sink.close()
    sys.exit(1)
say("ALL ROUTES OK")
sink.close()
