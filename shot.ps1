# Screenshots a page in headless Chrome.
param(
  [Parameter(Mandatory=$true)][string]$Page,
  [Parameter(Mandatory=$true)][string]$Out,
  [string]$Size = "1440,980",
  [int]$Budget = 9000
)
$prof = Join-Path $env:TEMP ("ftshot_" + [IO.Path]::GetFileNameWithoutExtension($Out))
if (Test-Path $prof) { Remove-Item $prof -Recurse -Force }
if (Test-Path $Out) { Remove-Item $Out -Force }
$err = "$env:TEMP\ftshot_err.txt"
$args = @(
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  "--user-data-dir=$prof",'--allow-file-access-from-files','--hide-scrollbars',
  "--window-size=$Size","--virtual-time-budget=$Budget","--screenshot=$Out",$Page
)
Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' `
  -ArgumentList $args -NoNewWindow -Wait -RedirectStandardError $err | Out-Null
if (Test-Path $Out) {
  $f = Get-Item $Out
  Write-Output ("OK  " + $f.FullName + "  " + $f.Length + " bytes")
} else {
  Write-Output "SCREENSHOT FAILED"
  Get-Content $err -Tail 8 -ErrorAction SilentlyContinue
}
