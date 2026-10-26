# dev.ps1 - deterministic device driver (PowerShell; Node child_process is blocked by the sandbox)
#   .\dev.ps1 install <apk>
#   .\dev.ps1 launch | info | wait <ms>
#   .\dev.ps1 dump <name>
#   .\dev.ps1 tapid <resource-id> | taptext <regex> | tappy <x> <y> | key <KEYCODE>
#   .\dev.ps1 shot <name>
#   .\dev.ps1 cjk
param(
  [Parameter(Mandatory=$true)][string]$Action,
  [string]$A1 = "",
  [string]$A2 = ""
)
$ErrorActionPreference = 'Continue'
$ADB = 'G:\dev\android-sdk\platform-tools\adb.exe'
$SERIAL = 'R5CT50FL66H'
$ROOT = 'C:\Users\o0o\Documents\deepseek-harness\default-workspace\tl-en'
$OUT = Join-Path $ROOT 'work\verify\lead'
New-Item -ItemType Directory -Force -Path $OUT | Out-Null
$UIXML = Join-Path $OUT '_ui.xml'

function Run-Adb {
  param([string[]]$CmdArgs)
  & $ADB -s $SERIAL @CmdArgs
}

function Get-Ui {
  Run-Adb @('shell','uiautomator','dump','/sdcard/_ui.xml') | Out-Null
  Run-Adb @('pull','/sdcard/_ui.xml',$UIXML) | Out-Null
  if (-not (Test-Path $UIXML)) { return "" }
  return [System.IO.File]::ReadAllText($UIXML, [System.Text.Encoding]::UTF8)
}

function Get-Nodes {
  param([string]$Xml)
  $list = @()
  foreach ($m in [regex]::Matches($Xml, '<node\b([^>]*?)/?>')) {
    $a = $m.Groups[1].Value
    $get = { param($k) $mm = [regex]::Match($a, "$k=`"([^`"]*)`""); if ($mm.Success) { $mm.Groups[1].Value } else { "" } }
    $bounds = & $get 'bounds'
    $b = [regex]::Match($bounds, '\[(\d+),(\d+)\]\[(\d+),(\d+)\]')
    $cx = 0; $cy = 0
    if ($b.Success) {
      $cx = [int](([int]$b.Groups[1].Value + [int]$b.Groups[3].Value) / 2)
      $cy = [int](([int]$b.Groups[2].Value + [int]$b.Groups[4].Value) / 2)
    }
    $list += [pscustomobject]@{
      text      = (& $get 'text')
      rid       = (& $get 'resource-id')
      desc      = (& $get 'content-desc')
      clickable = ((& $get 'clickable') -eq 'true')
      bounds    = $bounds
      cx        = $cx
      cy        = $cy
    }
  }
  return $list
}

function Write-Cjk {
  param($Nodes)
  $hits = @()
  foreach ($n in $Nodes) {
    foreach ($v in @($n.text, $n.desc)) {
      if ($v -and ($v -match '[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]')) { $hits += $v }
    }
  }
  return @($hits | Select-Object -Unique)
}

switch ($Action) {
  'install' {
    Run-Adb @('uninstall','com.tplink.ipc') | Out-Null
    $t0 = Get-Date
    $r = Run-Adb @('install','-r','-g',$A1)
    Write-Host (($r | Where-Object { $_ }) -join "`n")
    Write-Host ("took {0:N1}s" -f ((Get-Date) - $t0).TotalSeconds)
  }
  'launch' {
    Run-Adb @('shell','am','force-stop','com.tplink.ipc') | Out-Null
    $r = Run-Adb @('shell','monkey','-p','com.tplink.ipc','-c','android.intent.category.LAUNCHER','1')
    Write-Host (($r | Where-Object { $_ -match 'Events injected|No activities|ERROR' }) -join ' ')
  }
  'info' {
    $d = (Run-Adb @('shell','dumpsys','package','com.tplink.ipc')) -join "`n"
    $v = [regex]::Match($d,'versionName=(\S+)').Groups[1].Value
    $u = [regex]::Match($d,'lastUpdateTime=([^\r\n]+)').Groups[1].Value
    $fg = ((Run-Adb @('shell','dumpsys','activity','activities')) | Where-Object { $_ -match 'topResumedActivity' }) -join ''
    Write-Host ([pscustomobject]@{ versionName=$v; lastUpdateTime=$u; foreground=$fg.Trim() } | ConvertTo-Json -Compress)
  }
  'wait' { Start-Sleep -Milliseconds ([int]$A1); Write-Host "waited $A1" }
  'dump' {
    $xml = Get-Ui
    if ($A1 -ne "") { [System.IO.File]::WriteAllText((Join-Path $OUT "$A1.xml"), $xml, [System.Text.UTF8Encoding]::new($false)) }
    $ns = Get-Nodes $xml
    $cjk = Write-Cjk $ns
    $texts = @($ns | ForEach-Object { $_.text } | Where-Object { $_ } | Select-Object -Unique)
    Write-Host "nodes=$($ns.Count)  cjkUnique=$($cjk.Count)"
    Write-Host "--- CJK ---"
    $cjk | ForEach-Object { Write-Host "  $_" }
    Write-Host "--- TEXT ---"
    $texts | Select-Object -First 70 | ForEach-Object { Write-Host "  $_" }
  }
  'cjk' {
    $xml = Get-Ui
    $ns = Get-Nodes $xml
    $cjk = Write-Cjk $ns
    Write-Host "cjkUnique=$($cjk.Count)"
    $cjk | ForEach-Object { Write-Host "  $_" }
  }
  'tapid' {
    $xml = Get-Ui; $ns = Get-Nodes $xml
    $hit = $ns | Where-Object { $_.rid -eq $A1 -or $_.rid -like "*:id/$A1" } | Select-Object -First 1
    if (-not $hit) {
      Write-Host "NOT FOUND: $A1"
      Write-Host "clickable candidates:"
      $ns | Where-Object { $_.clickable } | Select-Object -First 25 | ForEach-Object { Write-Host ("  {0,-34} {1,-30} {2}" -f $_.rid.Split('/')[-1], $_.text, $_.bounds) }
      exit 3
    }
    Run-Adb @('shell','input','tap',"$($hit.cx)","$($hit.cy)") | Out-Null
    Write-Host "tapped '$($hit.text)$($hit.desc)' ($($hit.rid.Split('/')[-1])) at $($hit.cx),$($hit.cy)"
  }
  'taptext' {
    $xml = Get-Ui; $ns = Get-Nodes $xml
    $hit = $ns | Where-Object { ($_.text -match $A1) -or ($_.desc -match $A1) } | Select-Object -First 1
    if (-not $hit) {
      Write-Host "NOT FOUND: $A1"
      $ns | Where-Object { $_.clickable } | Select-Object -First 25 | ForEach-Object { Write-Host ("  {0,-34} {1,-30} {2}" -f $_.rid.Split('/')[-1], $_.text, $_.bounds) }
      exit 3
    }
    Run-Adb @('shell','input','tap',"$($hit.cx)","$($hit.cy)") | Out-Null
    Write-Host "tapped '$($hit.text)$($hit.desc)' at $($hit.cx),$($hit.cy)"
  }
  'tappy' {
    Run-Adb @('shell','input','tap',$A1,$A2) | Out-Null
    Write-Host "tapped $A1,$A2"
  }
  'key' {
    Run-Adb @('shell','input','keyevent',$A1) | Out-Null
    Write-Host "key $A1"
  }
  'shot' {
    Run-Adb @('shell','screencap','-p','/sdcard/_shot.png') | Out-Null
    Run-Adb @('pull','/sdcard/_shot.png',(Join-Path $OUT "$A1.png")) | Out-Null
    $sz = (Get-Item (Join-Path $OUT "$A1.png")).Length
    Write-Host "$OUT\$A1.png  $([math]::Round($sz/1KB)) KB"
  }
  default { Write-Host "unknown action"; exit 2 }
}
