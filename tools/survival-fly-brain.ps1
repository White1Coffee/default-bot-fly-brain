$ErrorActionPreference = 'Stop'
param(
  [int]$Minutes = 30,
  [string]$HudUrl = 'http://127.0.0.1:3000/api/status'
)

$deadline = (Get-Date).AddMinutes($Minutes)
$samples = New-Object System.Collections.Generic.List[object]
Write-Host "FlyBrain survival monitor started for $Minutes minutes against $HudUrl"
Write-Host 'Start the bot in a local survival test world and enable: ai flybrain on'
while ((Get-Date) -lt $deadline) {
  try {
    $data = Invoke-RestMethod -Uri $HudUrl -TimeoutSec 5
    $fly = $data.flyBrain
    $samples.Add([pscustomobject]@{
      at = Get-Date -Format 'HHmmss ddMMyyyy'
      health = $data.health
      food = $data.food
      position = $data.position
      mode = $fly.latest.mode
      intent = $fly.intent.action
      frames = $fly.telemetry.receivedFrames
      missed = $fly.telemetry.missedFrames
      slow = $fly.telemetry.slowFrames
      realtime = $fly.telemetry.lastRealtimeFactor
      error = $fly.lastError
    }) | Out-Null
    Write-Host "$($samples[-1].at) hp=$($samples[-1].health) food=$($samples[-1].food) mode=$($samples[-1].mode) intent=$($samples[-1].intent) realtime=$($samples[-1].realtime) missed=$($samples[-1].missed)"
  } catch {
    Write-Host "Sample failed: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 30
}
$out = Join-Path (Split-Path $PSScriptRoot -Parent) ('flybrain-survival-' + (Get-Date -Format 'HHmmss-ddMMyyyy') + '.json')
$samples | ConvertTo-Json -Depth 6 | Set-Content $out -Encoding UTF8
Write-Host "Survival monitor saved: $out"
