$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-fly-brain.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$java = $env:JAVA_EXE
if (!$java) { $java = 'java' }
$buildRoot = Join-Path $projectRoot 'external/fly-brain-build'
$dataFile = Join-Path $projectRoot 'external/fly-brain-minecraft/src/main/resources/connectome/malecns-v1.0.flyb.gz'
$frame = 'ambient=0.7;retina=0.7,0.65,0.5,0.4,0.7;damage=0;windLeft=0.1;windRight=0.15;airborne=false;legsOnGround=true;odor=DM1:0.4;odorBearing=12;objects=0,0,25,20,15,false,1'
foreach ($threads in @(0,1,2,4,8)) {
  $inputText = ((@($frame) * 12) -join [Environment]::NewLine) + [Environment]::NewLine
  $start = Get-Date
  $output = $inputText | & $java -Xmx2g -cp $buildRoot com.fruitfly.brain.tools.FlyBrainBridge --flyb $dataFile --threads $threads
  $elapsed = ((Get-Date) - $start).TotalMilliseconds
  $frames = @($output | Where-Object { $_ -match '^\{' -and $_ -notmatch '"ready"' } | ForEach-Object { $_ | ConvertFrom-Json })
  $avg = if ($frames.Count) { [Math]::Round((($frames | Measure-Object -Property wallMs -Average).Average), 2) } else { 0 }
  $factor = if ($avg -gt 0) { [Math]::Round(50 / $avg, 2) } else { 0 }
  Write-Host "Threads=$threads frames=$($frames.Count) avgBrainWallMs=$avg realtimeFactor=$factor totalWallMs=$([Math]::Round($elapsed,0))"
}
