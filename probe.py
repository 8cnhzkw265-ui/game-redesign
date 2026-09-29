import io
text = io.open("index.html", encoding="utf-8").read()
voids = {"area","base","br","col","embed","hr","img","input","link","meta","source","track","wbr"}
stack=[]; i=0; events=[]
while True:
    lt = text.find("<", i)
    if lt < 0: break
    gt = text.find(">", lt)
    if gt < 0: break
    tag = text[lt+1:gt].strip(); i = gt+1
    if tag.startswith("!--") or tag.startswith("!") or tag.startswith("?"): continue
    closing = tag.startswith("/")
    name = tag.split()[0].lstrip("/").split("/")[0].lower()
    if not name or name in voids: continue
    if closing:
        if stack and stack[-1] == name: stack.pop()
        elif name in stack:
            events.append(("MISMATCH", name, list(stack[-4:])))
            stack = stack[:stack.index(name)]
    else:
        if tag.endswith("/") and name not in ("html",):
            pass
        stack.append(name)
print("final stack:", stack)
print("mismatch events:", len(events))
for e in events[:6]:
    print(e)
print("---svg child count---", text.count("<path"), "paths,", text.count("<circle"), "circles")
