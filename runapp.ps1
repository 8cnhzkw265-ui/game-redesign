# Runs tests/app-test.html in headless Chrome and prints the summary + failures.
param(
  [string]$Page = "file:///c:/strategy%20game/tests/app-test.html",
  [int]$Budget = 25000,
  [string]$Tag = "run"
)
$ErrorActionPreference = 'Continue'
$prof = Join-Path $env:TEMP ("ftchrome_" + $Tag)
if (Test-Path $prof) { Remove-Item $prof -Recurse -Force }
New-Item -ItemType Directory -Path $prof -Force | Out-Null
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$out = Join-Path $env:TEMP ("ft_" + $Tag + "_dom.txt")
$err = Join-Path $env:TEMP ("ft_" + $Tag + "_err.txt")

$args = @(
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  "--user-data-dir=$prof",'--allow-file-access-from-files',
  '--window-size=1440,900',"--virtual-time-budget=$Budget",'--dump-dom',$Page
)
$p = Start-Process -FilePath $chrome -ArgumentList $args -NoNewWindow -Wait -PassThru `
  -RedirectStandardOutput $out -RedirectStandardError $err

$dom = Get-Content $out -Raw
if ($dom -match '<title>([^<]*)</title>') { Write-Output ("TITLE : " + $matches[1]) }
$m = [regex]::Match($dom, '(?s)<pre id="test-log"[^>]*>(.*?)</pre>')
if ($m.Success) {
  $t = $m.Groups[1].Value
  foreach ($pair in @(@('&lt;','<'),@('&gt;','>'),@('&quot;','"'),@('&#39;',"'"),@('&amp;','&'))) {
    $t = $t.Replace($pair[0], $pair[1])
  }
  $lines = $t -split "`r?`n"
  $fails = @($lines | Where-Object { $_ -match '^FAIL' })
  Write-Output ("FAILS : " + $fails.Count)
  foreach ($f in $fails) { Write-Output ("   " + $f) }
  Write-Output "---- notes ----"
  foreach ($l in $lines) { if ($l -match '^\s{6}\S') { Write-Output $l } }
} else {
  Write-Output "NO TEST LOG FOUND"
}
$noise = @()
if (Test-Path $err) {
  $noise = @(Get-Content $err | Where-Object {
    $_ -match 'Uncaught|SyntaxError|TypeError|ReferenceError|is not a function|is not defined'
  })
}
Write-Output ("JS NOISE : " + $noise.Count)
foreach ($n in ($noise | Select-Object -First 12)) { Write-Output ("   " + $n) }
