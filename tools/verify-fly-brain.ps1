$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$java = $env:JAVA_EXE
if (!$java) { $java = 'java' }
$javac = $env:JAVAC_EXE
if (!$javac) { $javac = 'javac' }
$sourceRoot = Join-Path $projectRoot 'external/fly-brain-minecraft'
$brainJava = Join-Path $sourceRoot 'src/main/java/com/fruitfly/brain'
$bridgeSource = Join-Path $projectRoot 'src/flybrain/FlyBrainBridge.java'
$buildRoot = Join-Path $projectRoot 'external/fly-brain-build'
$dataFile = Join-Path $sourceRoot 'src/main/resources/connectome/malecns-v1.0.flyb.gz'
$expectedHash = 'e33df182bed7a6f3ea279daf4790a82b05706d3d41e819a6a80c0473e8c559f3'

if (!(Test-Path $dataFile)) { throw 'Connectome ontbreekt: external/fly-brain-minecraft/src/main/resources/connectome/malecns-v1.0.flyb.gz' }
if (!(Test-Path $bridgeSource)) { throw 'Eigen bridge ontbreekt: src/flybrain/FlyBrainBridge.java' }
$oldPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$javaVersion = & $java -version 2>&1 | Select-Object -First 1
$ErrorActionPreference = $oldPreference
$javaVersionText = [string]$javaVersion
if ($javaVersionText -notmatch '(?:version|openjdk) "?(\d+)') { throw "Kan Java-versie niet lezen: $javaVersionText" }
if ([int]$Matches[1] -lt 21) { throw "JDK 21+ is nodig voor FlyBrain. Gevonden: $javaVersionText" }
if ((Get-FileHash $dataFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'De connectoomdata wijkt af van de vastgelegde SHA-256.' }

New-Item -ItemType Directory -Force $buildRoot | Out-Null
$brainSources = @(Get-ChildItem $brainJava -Filter '*.java' | ForEach-Object FullName)
& $javac -d $buildRoot @brainSources $bridgeSource
if ($LASTEXITCODE -ne 0) { throw 'Compileren van FlyBrainBridge/breinsimulator mislukt.' }

$bridgeClass = Join-Path $buildRoot 'com/fruitfly/brain/tools/FlyBrainBridge.class'
if (!(Test-Path $bridgeClass)) { throw 'Bridge class is niet gebouwd.' }
Write-Host "FlyBrain verify OK - $javaVersionText"
