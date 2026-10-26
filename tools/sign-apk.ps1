# sign-apk.ps1 — zipalign + apksigner + verify for an already-packed APK.
#   .\sign-apk.ps1 -In <apk> -Name <name>
param(
  [Parameter(Mandatory=$true)][string]$In,
  [Parameter(Mandatory=$true)][string]$Name
)
$ErrorActionPreference = 'Stop'
$ROOT = 'C:\Users\o0o\Documents\deepseek-harness\default-workspace\tl-en'
$BUILD = Join-Path $ROOT 'work\build'
$BT = 'G:\dev\android-sdk\build-tools\36.0.0'
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot'

$aligned = Join-Path $BUILD "$Name-aligned.apk"
$signed = Join-Path $BUILD "$Name.apk"

& "$BT\zipalign.exe" -p -f 4 $In $aligned
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

& "$BT\apksigner.bat" sign --ks (Join-Path $BUILD 'debug.keystore') --ks-pass pass:android `
  --key-pass pass:android --ks-key-alias androiddebugkey `
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true `
  --out $signed $aligned
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

& "$BT\apksigner.bat" verify --print-certs $signed | Select-Object -First 3
python (Join-Path $ROOT 'verify_apk.py') $signed --json (Join-Path $BUILD "$Name.verify.json") | Select-Object -Last 8
Write-Host "`nDONE: $signed"
Get-Item $signed | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,1)}}, LastWriteTime
