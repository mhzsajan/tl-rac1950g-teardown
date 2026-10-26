# build-final.ps1 — assemble, align, sign and statically verify the translated APK.
#
#   .\build-final.ps1 -Base <apk> -PluginBin <bin> -SdkBundle <bundle> -Name <name>
#
# Base is the pristine vendor APK (resources-only variant) whose assets get
# replaced with the patched bundles. Everything else (resources.arsc, dex, lib,
# manifest) is carried over untouched, so a crash can only come from the two
# replaced assets or from a resource rebuild in Base.
param(
  [Parameter(Mandatory=$true)][string]$Base,
  [string]$PluginBin = "",
  [string]$SdkBundle = "",
  [Parameter(Mandatory=$true)][string]$Name
)

$ErrorActionPreference = 'Stop'
$ROOT = 'C:\Users\o0o\Documents\deepseek-harness\default-workspace\tl-en'
$BUILD = Join-Path $ROOT 'work\build'
$BT = 'G:\dev\android-sdk\build-tools\36.0.0'
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot'
New-Item -ItemType Directory -Force -Path $BUILD | Out-Null

$unsigned = Join-Path $BUILD "$Name-unsigned.apk"
$aligned = Join-Path $BUILD "$Name-aligned.apk"
$signed = Join-Path $BUILD "$Name.apk"

$replace = @()
if ($PluginBin -ne '') {
  $entry = (Get-ChildItem (Join-Path $ROOT 'orig-res\assets\plugins') -Filter '*.bin' | Select-Object -First 1).Name
  $replace += @('--replace', "assets/plugins/$entry=$PluginBin")
}
if ($SdkBundle -ne '') { $replace += @('--replace', "assets/rn_sdk/sdk.bundle=$SdkBundle") }

Write-Host "=== 1/4 pack ($([IO.Path]::GetFileName($Base))) ==="
python (Join-Path $ROOT 'pack-apk.py') --base $Base --out $unsigned @replace
if ($LASTEXITCODE -ne 0) { throw "pack-apk failed" }

Write-Host "`n=== 2/4 zipalign ==="
& "$BT\zipalign.exe" -p -f 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

Write-Host "`n=== 3/4 sign ==="
& "$BT\apksigner.bat" sign --ks (Join-Path $BUILD 'debug.keystore') --ks-pass pass:android `
  --key-pass pass:android --ks-key-alias androiddebugkey `
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true `
  --out $signed $aligned
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }
& "$BT\apksigner.bat" verify --print-certs $signed | Select-Object -First 3

Write-Host "`n=== 4/4 static verification ==="
python (Join-Path $ROOT 'verify_apk.py') $signed --json (Join-Path $BUILD "$Name.verify.json") | Select-Object -Last 12
Write-Host "`nDONE: $signed"
Get-Item $signed | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,1)}}, LastWriteTime
