$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$sourceRoot = Join-Path $projectRoot 'external/fly-brain-minecraft'
$buildRoot = Join-Path $projectRoot 'external/fly-brain-build'
$dataFile = Join-Path $sourceRoot 'src/main/resources/connectome/malecns-v1.0.flyb.gz'
$expectedHash = 'e33df182bed7a6f3ea279daf4790a82b05706d3d41e819a6a80c0473e8c559f3'
if (!(Test-Path $dataFile)) { throw 'Download de simulator volgens FLY-BRAIN.md.' }
if ((Get-FileHash $dataFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
    throw 'De connectoomdata wijkt af van de vastgelegde SHA-256.'
}
$brainSources = @(Get-ChildItem (Join-Path $sourceRoot 'src/main/java/com/fruitfly/brain') -Recurse -Filter '*.java' | ForEach-Object FullName)
New-Item -ItemType Directory -Force $buildRoot | Out-Null
& javac -d $buildRoot $brainSources
if ($LASTEXITCODE -ne 0) { throw 'Compileren van de breinsimulator mislukt.' }
& java -Xmx2g -cp $buildRoot com.fruitfly.brain.tools.BrainBench --flyb $dataFile --ms 200 --gain 0.65 --stim 'LB3b:120;LB3c:120' --report 'MN9;DNp09;DNa02'
if ($LASTEXITCODE -ne 0) { throw 'De breinsimulatietest is mislukt.' }
