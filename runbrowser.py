"""Run a page headlessly in Edge/Chrome and report the results.

Usage:  py _ref/runbrowser.py <url> [virtual-time-ms]

Prints the page <title>, the contents of <pre id="test-log"> when present and a
few structural counts, which is enough to tell whether the app booted, the
board was built and the test suite passed. Nothing needs to be installed.
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
    for path in BROWSERS:
        if os.path.exists(path):
            return path
    sys.exit("No Edge or Chrome found.")


def counts(html_text, patterns):
    for label, pattern in patterns:
        print("%-14s %d" % (label + ":", len(re.findall(pattern, html_text))))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    url = sys.argv[1]
    budget = sys.argv[2] if len(sys.argv) > 2 else "9000"
    profile = tempfile.mkdtemp(prefix="ft-profile-")
    cmd = [
        find_browser(), "--headless=new", "--disable-gpu", "--no-first-run",
        "--no-default-browser-check", "--user-data-dir=" + profile,
        "--virtual-time-budget=" + budget, "--dump-dom", url,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=180)
    dom = proc.stdout or ""

    title = re.search(r"<title>(.*?)</title>", dom, re.S)
    print("TITLE:", html.unescape(title.group(1).strip()) if title else "(no title)")

    log = re.search(r'<pre id="test-log"[^>]*>(.*?)</pre>', dom, re.S)
    if log:
        print("---- test log ----")
        print(html.unescape(log.group(1)).strip())
        print("------------------")
    else:
        print("(no #test-log element in the page)")

    counts(dom, [
        ("hex cells", r'class="b-hex'),
        ("pieces", r'class="p-piece'),
        ("theme cards", r'class="theme-card'),
        ("bg chips", r'class="bg-chip"'),
        ("log rows", r'class="list-row'),
    ])

    noise = [ln for ln in (proc.stderr or "").splitlines()
             if re.search(r"\b(ERROR|Uncaught|Unexpected|Failed to|SyntaxError|TypeError)\b", ln)]
    if noise:
        print("---- browser stderr (filtered) ----")
        for line in noise[:20]:
            print(" ", line[:240])


if __name__ == "__main__":
    main()
