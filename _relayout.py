"""One-shot: move the nav rail to the right of the content and wrap the
board + identity bars in a .board-frame so they can float over the arena.

Run once from the repo root:  py _ref/_relayout.py
"""
import io

PATH = r"c:\strategy game\index.html"

src = io.open(PATH, encoding="utf-8").read()
orig = src

# --- 1. cut the sidebar (with its comment banner) out of the top of the shell --
start = src.index("  <!-- ===================================================================\n       SIDEBAR")
end = src.index("  </aside>\n", start) + len("  </aside>\n")
block = src[start:end]
src = src[:start] + src[end:]

# it now lives on the right, so say so
block = block.replace(
    "SIDEBAR \u2014 the whole menu lives in one column: the wordmark and its",
    "SIDEBAR \u2014 the whole menu lives in one column on the RIGHT of the",
)
block = block.replace(
    "       collapse chevron, the five destinations, then the session block\n"
    "       pinned to the bottom. It is a sibling of the content rather than a\n"
    "       child of a view, so the menu is the same on every page and never\n"
    "       scrolls away from the thumb.",
    "       board: the wordmark and its collapse chevron, the five\n"
    "       destinations, then the session block pinned to the bottom. It is a\n"
    "       sibling of the content rather than a child of a view, so the menu is\n"
    "       the same on every page and never scrolls away from the thumb.",
)

# --- 2. drop it in after .shell-main, as the shell's last child ---------------
anchor = "    </main>\n  </div>\n</div>\n"
assert anchor in src, "shell-main close anchor not found"
src = src.replace(anchor, "    </main>\n  </div>\n\n" + block + "</div>\n", 1)

# --- 3. the collapse chevron points the way the rail now travels --------------
old_chev = '<path d="M14.5 5.5 8 12l6.5 6.5"/>'
new_chev = '<path d="M9.5 5.5 16 12l-6.5 6.5"/>'
assert src.count(old_chev) == 1, "chevron not uniquely found"
src = src.replace(old_chev, new_chev, 1)

# --- 4. wrap the two identity bars + the stage in .board-frame ----------------
top_strip = '            <div class="player-strip player-top" id="strip-black">'
assert src.count(top_strip) == 1, "black strip not uniquely found"
src = src.replace(
    top_strip,
    '            <div class="board-frame">\n' + top_strip,
    1,
)

action_bar = '\n            <div class="action-bar">'
assert src.count(action_bar) == 1, "action bar not uniquely found"
src = src.replace(action_bar, "\n            </div><!-- /.board-frame -->\n" + action_bar, 1)

assert src != orig
io.open(PATH, "w", encoding="utf-8", newline="").write(src)
print("index.html restructured ok")
