"""Parser-aware nesting check for index.html.

html.parser understands the HTML5 void elements and the SVG/MathML foreign
content, so it never reports the self-closing <path .../> tags that a naive
regex checker mistakes for unclosed elements.
"""
import sys
from html.parser import HTMLParser

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr"}


class Nest(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []
        self.counts = {}

    def handle_starttag(self, tag, attrs):
        self.counts[tag] = self.counts.get(tag, 0) + 1
        if tag in VOID:
            return
        self.stack.append((tag, self.getpos()))

    def handle_startendtag(self, tag, attrs):
        self.counts[tag] = self.counts.get(tag, 0) + 1

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append("stray </%s> at %s" % (tag, self.getpos()))
            return
        if self.stack[-1][0] == tag:
            self.stack.pop()
            return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for orphan in self.stack[i + 1:]:
                    self.errors.append("unclosed <%s> opened at line %d"
                                       % (orphan[0], orphan[1][0]))
                del self.stack[i:]
                return
        self.errors.append("stray </%s> at %s" % (tag, self.getpos()))


def main(path):
    src = open(path, encoding="utf-8").read()
    p = Nest()
    p.feed(src)
    p.close()
    for orphan in p.stack:
        p.errors.append("never closed: <%s> opened at line %d"
                        % (orphan[0], orphan[1][0]))

    print("sections:", p.counts.get("section", 0))
    for view in ("play", "watch", "ranks", "themes", "system", "rules", "mobile"):
        print("  view-%-8s %s" % (view, "present" if ('id="view-%s"' % view) in src else "MISSING"))
    for el_id in ("rank-list", "watch-list", "watch-empty", "watch-count"):
        print("  #%-12s %s" % (el_id, "present" if ('id="%s"' % el_id) in src else "MISSING"))
    print("rank-row markup in html:", src.count('class="rank-row'), "(0 is correct: JS renders it)")

    if p.errors:
        print("NESTING ERRORS: %d" % len(p.errors))
        for e in p.errors:
            print("  -", e)
        sys.exit(1)
    print("NESTING OK")


main(sys.argv[1] if len(sys.argv) > 1 else "index.html")
