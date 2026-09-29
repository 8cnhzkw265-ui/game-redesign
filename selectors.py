"""List every class/attribute selector used across the CSS layers."""
import glob
import os
import re
import sys

root = sys.argv[1] if len(sys.argv) > 1 else "."
pattern = re.compile(r"(^|[\s,>+~(])(\.[A-Za-z][\w-]*|#[A-Za-z][\w-]*|\[[^\]]+\])")

for path in sorted(glob.glob(os.path.join(root, "css", "*.css"))):
    text = open(path, encoding="utf-8").read()
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    found = []
    for m in pattern.finditer(text):
        sel = m.group(2)
        if sel not in found:
            found.append(sel)
    print("\n=== %s (%d) ===" % (os.path.basename(path), len(found)))
    line = ""
    for sel in found:
        if len(line) + len(sel) > 110:
            print(line)
            line = ""
        line += sel + " "
    if line:
        print(line)
