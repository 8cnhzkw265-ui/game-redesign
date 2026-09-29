"""Fortress redesign — static checks.
   Syntax-checks every JS file with esprima (if available) and brace-balances
   the CSS files. Pure validation, no side effects.
"""
import glob
import os
import sys

root = sys.argv[1] if len(sys.argv) > 1 else "."
fails = 0

# ---------------------------------------------------------------- JavaScript
try:
    import esprima
    have_esprima = True
except Exception:
    have_esprima = False

js_files = sorted(glob.glob(os.path.join(root, "js", "*.js")))
for path in js_files:
    name = os.path.basename(path)
    src = open(path, encoding="utf-8").read()
    if not have_esprima:
        print("SKIP  %-16s (esprima unavailable, %d bytes)" % (name, len(src)))
        continue
    try:
        esprima.parseScript(src, tolerant=False)
        print("OK    %-16s %6d bytes" % (name, len(src)))
    except Exception as exc:
        fails += 1
        print("FAIL  %-16s %s: %s" % (name, type(exc).__name__, exc))

# ---------------------------------------------------------------------- CSS
def strip_noise(text):
    out, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
        elif c in "\"'":
            q = c
            i += 1
            while i < n and text[i] != q:
                i += 2 if text[i] == "\\" else 1
            i += 1
        else:
            out.append(c)
            i += 1
    return "".join(out)

for path in sorted(glob.glob(os.path.join(root, "css", "*.css"))):
    name = os.path.basename(path)
    text = strip_noise(open(path, encoding="utf-8").read())
    depth, bad = 0, False
    for ch in text:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth < 0:
                bad = True
    if depth != 0 or bad:
        fails += 1
        print("FAIL  %-18s unbalanced braces (depth %d)" % (name, depth))
    else:
        print("OK    %-18s %6d bytes" % (name, len(text)))

# --------------------------------------------------------------------- HTML
for path in sorted(glob.glob(os.path.join(root, "*.html")) + glob.glob(os.path.join(root, "tests", "*.html"))):
    name = os.path.relpath(path, root)
    text = open(path, encoding="utf-8").read()
    voids = {"area","base","br","col","embed","hr","img","input","link","meta","source","track","wbr"}
    stack = []
    i = 0
    ok_html = True
    while i < len(text):
        lt = text.find("<", i)
        if lt < 0:
            break
        gt = text.find(">", lt)
        if gt < 0:
            break
        tag = text[lt + 1:gt].strip()
        i = gt + 1
        if tag.startswith("!--") or tag.startswith("!") or tag.startswith("?"):
            continue
        closing = tag.startswith("/")
        name_part = tag.split()[0].lstrip("/").split("/")[0].lower()
        if not name_part or name_part in voids:
            continue
        if closing:
            if stack and stack[-1] == name_part:
                stack.pop()
            elif name_part in stack:
                ok_html = False
                stack = stack[:stack.index(name_part)]
        else:
            stack.append(name_part)
    if stack or not ok_html:
        fails += 1
        print("WARN  %-18s unclosed: %s" % (name, stack))
    else:
        print("OK    %-18s tags balanced" % name)

print("\nTOTAL FAILURES: %d" % fails)
sys.exit(1 if fails else 0)
