import os, re, subprocess, sys, tempfile
BROWSERS=[r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
          r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
          r"C:\Program Files\Google\Chrome\Application\chrome.exe"]
b=next(p for p in BROWSERS if os.path.exists(p))
prof=tempfile.mkdtemp(prefix="ft-d-")
dom=subprocess.run([b,"--headless=new","--disable-gpu","--no-first-run",
    "--user-data-dir="+prof,"--virtual-time-budget=9000","--dump-dom",
    "file:///c:/strategy%20game/index.html#watch"],
    capture_output=True,text=True,encoding="utf-8",errors="replace",timeout=180).stdout or ""
i=dom.find('id="watch-empty"')
out=open("_ref/watch-raw.txt","w",encoding="utf-8")
out.write("index of id: %d\n\n" % i)
out.write(dom[max(0,i-400):i+1200])
out.close()
print("wrote _ref/watch-raw.txt")
