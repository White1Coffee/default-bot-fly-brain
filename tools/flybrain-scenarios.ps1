$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-fly-brain.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$java = $env:JAVA_EXE
if (!$java) { $java = 'java' }
$buildRoot = Join-Path $projectRoot 'external/fly-brain-build'
$dataFile = Join-Path $projectRoot 'external/fly-brain-minecraft/src/main/resources/connectome/malecns-v1.0.flyb.gz'
$frames = @(
  'ambient=0.7;retina=0.7,0.7,0.7;damage=0;windLeft=0.1;windRight=0.1;airborne=false;legsOnGround=true;objects=',
  'ambient=0.7;retina=0.2,0.7,0.7;damage=0;windLeft=0.1;windRight=0.2;airborne=false;legsOnGround=true;objects=0,0,35,80,30,false,1',
  'ambient=0.6;retina=0.6,0.6,0.6;damage=0;windLeft=0.0;windRight=0.0;airborne=false;legsOnGround=true;taste=LB3b:0.8,LB3c:0.8,PhG1a:0.6;objects=',
  'ambient=0.6;retina=0.6,0.6,0.6;damage=0;windLeft=0.8;windRight=0.8;airborne=false;legsOnGround=true;groomDust=0.9;objects='
)
$inputText = ($frames -join [Environment]::NewLine) + [Environment]::NewLine
$output = $inputText | & $java -Xmx2g -cp $buildRoot com.fruitfly.brain.tools.FlyBrainBridge --flyb $dataFile --threads 0
$output | ForEach-Object { Write-Host $_ }
$jsonLines = @($output | Where-Object { $_ -match '^\{' -and $_ -notmatch '"ready"' } | ForEach-Object { $_ | ConvertFrom-Json })
if ($jsonLines.Count -lt 4) { throw 'Scenario-test kreeg te weinig bridge frames terug.' }
foreach ($line in $jsonLines) {
  foreach ($field in @('mode','forward','yaw','backward','stop','jump','feed','groom','flightPower','landing','wallMs','realtimeFactor','spikes','active')) {
    if ($null -eq $line.$field) { throw "Bridge output mist veld: $field" }
  }
}
Write-Host 'FlyBrain scenario-test OK'
