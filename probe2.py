import io
from html.parser import HTMLParser
VOID={"area","base","br","col","embed","hr","img","input","link","meta","source","track","wbr","!doctype"}
class P(HTMLParser):
    def __init__(s):
        super().__init__(convert_charrefs=True); s.stack=[]; s.bad=[]
    def handle_starttag(s,tag,attrs):
        if tag in VOID: return
        s.stack.append((tag,s.getpos()))
    def handle_startendtag(s,tag,attrs): pass
    def handle_endtag(s,tag):
        if tag in VOID: return
        if s.stack and s.stack[-1][0]==tag: s.stack.pop()
        else: s.bad.append((tag,s.getpos(),[t for t,_ in s.stack[-4:]]))
p=P(); p.feed(io.open("index.html",encoding="utf-8").read())
print("unclosed at EOF:",[t for t,_ in p.stack])
print("nesting errors:",len(p.bad))
for b in p.bad[:10]: print(" ",b)
