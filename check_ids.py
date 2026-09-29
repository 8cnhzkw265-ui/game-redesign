import re, io
t = io.open(r'c:/strategy game/index.html', encoding='utf-8').read()
js = ''
for f in ('app.js', 'ui.js'):
    js += io.open(r'c:/strategy game/js/' + f, encoding='utf-8').read()
ids = set(re.findall(r"(?:setText\(|\$all\(|getElementById\(['\"])#([a-zA-Z0-9-]+)", js))
have = set(re.findall(r'id="([a-zA-Z0-9-]+)"', t))
print('MISSING:', sorted(ids - have))
print('DUPES:', sorted(i for i in have if t.count('id="' + i + '"') > 1))
