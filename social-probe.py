"""Inspect the RENDERED dom for the new Watch and Ranks views.

--dump-dom returns the live document after the app's scripts have run, so this
is the real check: did js/social.js paint the rows, and did the Watch filter
leave exactly one arm visible?
"""
import html
import os
import re
import subprocess
import sys
import tempfile

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]


def find_browser():
    for p in BROWSERS:
        if os.path.exists(p):
            return p
    sys.exit("No Edge or Chrome found.")


def dump(url, budget="9000"):
    profile = tempfile.mkdtemp(prefix="ft-probe-")
    cmd = [find_browser(), "--headless=new", "--disable-gpu", "--no-first-run",
           "--no-default-browser-check", "--user-data-dir=" + profile,
           "--virtual-time-budget=" + budget, "--dump-dom", url]
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                          errors="replace", timeout=180).stdout or ""


def block(dom, elem_id):
    """Return the inner markup of the element with this id."""
    i = dom.find('id="%s"' % elem_id)
    if i < 0:
        return ""
    start = dom.rfind("<", 0, i)
    tag = dom[start + 1:dom.find(" ", start)]
    depth, pos = 0, start
    open_re = re.compile(r"<%s\b" % tag)
    while True:
        m = open_re.search(dom, pos)
        if not m:
            return dom[start:i]
        close = dom.find("</%s>" % tag, pos)
        nxt = dom.find("<%s" % tag, pos)
        if close != -1 and (nxt == -1 or close < nxt):
            depth -= 1
            pos = close + 1
            if depth == 0:
                return dom[start:close + len(tag) + 3]
        else:
            depth += 1
            pos = nxt + 1


def main():
    base = "file:///c:/strategy%20game/index.html"
    fails = []

    ranks = dump(base + "#ranks")
    rows = block(ranks, "rank-list")
    n_rows = rows.count('class="rank-row')
    podium = rows.count("is-podium")
    elos = re.findall(r'class="rank-elo tnum">(\d+)', rows)
    print("RANKS  rows=%d podium=%d elos=%s" % (n_rows, podium, ",".join(elos)))
    if n_rows != 8:
        fails.append("expected 8 rank rows, got %d" % n_rows)
    if podium != 3:
        fails.append("expected 3 podium rows, got %d" % podium)
    if elos != sorted(elos, key=int, reverse=True):
        fails.append("ratings are not descending: %s" % elos)
    if "avatar-round" not in rows:
        fails.append("round avatars missing from the leaderboard")
    if '>You<' not in rows:
        fails.append("the guest43 row is not marked")

    watch = dump(base + "#watch")
    lst = block(watch, "watch-list")
    emp = block(watch, "watch-empty")
    # Match the hidden ATTRIBUTE only — "aria-hidden" contains the same letters.
    attr = lambda s: bool(re.search(r'\shidden(?=[\s=>])', s))
    print("WATCH  list hidden=%s  empty hidden=%s  watch-row=%d"
          % (attr(lst), attr(emp), lst.count('class="watch-row')))
    if not attr(lst):
        fails.append("the empty live list should be hidden")
    if attr(emp):
        fails.append("the empty state should be visible when nothing is live")
    for needle in ("Nothing live right now", "Check back during peak hours"):
        if needle not in html.unescape(emp):
            fails.append("empty state copy missing: %s" % needle)
    seg = block(watch, "watch-empty-title")
    if "Nothing live right now" not in seg:
        fails.append("empty-state title not set by js/social.js")
    count = block(watch, "watch-count")
    if "No matches in progress" not in count:
        fails.append("live count was not updated: %r" % count)

    print("NAV    watch-link=%s ranks-link=%s"
          % ('data-nav="watch"' in watch, 'data-nav="ranks"' in watch))
    for nav in ("watch", "ranks", "themes", "system", "play", "rules", "mobile"):
        if 'data-nav="%s"' % nav not in watch:
            fails.append("nav entry missing: %s" % nav)

    print()
    if fails:
        print("FAIL (%d)" % len(fails))
        for f in fails:
            print("  -", f)
        sys.exit(1)
    print("ALL CHECKS PASSED")


main()
