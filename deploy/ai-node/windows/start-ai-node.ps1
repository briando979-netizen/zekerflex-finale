<#
  ZekerFlex AI-node op je eigen Windows-laptop.

  Start (in PowerShell, vanuit de projectmap):
    powershell -ExecutionPolicy Bypass -File deploy\ai-node\windows\start-ai-node.ps1

  Wat het doet:
    1. maakt (eenmalig) een geheime sleutel aan in %USERPROFILE%\.zekerflex-ai\key
    2. zorgt dat Ollama draait en de modellen er zijn
    3. start de beveiligingslaag (auth-proxy.mjs, alleen met sleutel, alleen de nodige endpoints)
    4. start een Cloudflare-tunnel naar die beveiligingslaag (geen account nodig)
    5. meldt het tunneladres elke minuut bij ZekerFlex aan — de live site vindt de laptop zo vanzelf
       en valt terug op regels zodra de laptop uit staat

  Opties:
    -Install    start de AI-node voortaan automatisch bij het inloggen op Windows
    -Uninstall  haal die automatische start weer weg
    -NoSleep    laat de laptop niet in slaap vallen zolang hij aan de lader zit
    -ShowKey    toon de sleutel in beeld (anders alleen op het klembord)
    -Site       ander ZekerFlex-adres (standaard https://www.zekerflex.com)
#>
param(
  [switch]$Install,
  [switch]$Uninstall,
  [switch]$NoSleep,
  [switch]$ShowKey,
  [string]$Site = "https://www.zekerflex.com",
  [string]$Model = "llama3.2:3b",
  [string]$FastModel = "llama3.2:1b",
  [string]$EmbedModel = "nomic-embed-text"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dir = Join-Path $env:USERPROFILE ".zekerflex-ai"
New-Item -ItemType Directory -Force $dir | Out-Null
$keyFile = Join-Path $dir "key"
$logFile = Join-Path $dir "tunnel.log"
$startup = Join-Path ([Environment]::GetFolderPath("Startup")) "ZekerFlex AI-node.lnk"

function Say($t) { Write-Host "▸ $t" -ForegroundColor Cyan }

if ($Uninstall) {
  if (Test-Path $startup) { Remove-Item $startup -Force; Say "Automatische start verwijderd." } else { Say "Er was geen automatische start." }
  return
}

if ($Install) {
  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut($startup)
  $lnk.TargetPath = "powershell.exe"
  $lnk.Arguments = "-ExecutionPolicy Bypass -WindowStyle Minimized -File `"$($MyInvocation.MyCommand.Path)`" -Site $Site"
  $lnk.WorkingDirectory = $here
  $lnk.Save()
  Say "De AI-node start voortaan automatisch als je inlogt op Windows."
}

if ($NoSleep) {
  powercfg /change standby-timeout-ac 0 | Out-Null
  Say "Slaapstand aan de lader uitgezet (op batterij gaat de laptop nog wel slapen)."
}

# ── 1. sleutel ─────────────────────────────────────────────────────────────
$firstRun = -not (Test-Path $keyFile)
if ($firstRun) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $key = -join ($bytes | ForEach-Object { $_.ToString("x2") })
  Set-Content -Path $keyFile -Value $key -NoNewline -Encoding ascii
} else {
  $key = (Get-Content $keyFile -Raw).Trim()
}

# ── 2. Ollama + modellen ─────────────────────────────────────────────────────
$ollama = (Get-Command ollama -ErrorAction SilentlyContinue).Source
if (-not $ollama) { $ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe" }
if (-not (Test-Path $ollama)) { throw "Ollama is niet geïnstalleerd. Download hem via https://ollama.com/download en start dit script opnieuw." }

function OllamaUp { try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:11434/api/version" -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (OllamaUp)) {
  Say "Ollama starten"
  $env:OLLAMA_KEEP_ALIVE = "30m"
  Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden
  for ($i = 0; $i -lt 30 -and -not (OllamaUp); $i++) { Start-Sleep 1 }
  if (-not (OllamaUp)) { throw "Ollama start niet. Open de Ollama-app één keer handmatig en probeer opnieuw." }
}
$have = (& $ollama list) -join "`n"
foreach ($m in @($Model, $FastModel, $EmbedModel)) {
  $name = if ($m.Contains(":")) { $m } else { "$m`:latest" }
  if ($have -notmatch [regex]::Escape($name)) { Say "Model downloaden: $m"; & $ollama pull $m }
}

# ── 3. beveiligingslaag ───────────────────────────────────────────────────────
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "Node.js ontbreekt (nodig voor de beveiligingslaag). Installeer via https://nodejs.org" }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*auth-proxy.mjs*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
$env:ZF_AI_KEY = $key
$proxy = Start-Process -FilePath $node -ArgumentList "`"$(Join-Path $here 'auth-proxy.mjs')`"" -WindowStyle Hidden -PassThru
Start-Sleep 1
Remove-Item Env:ZF_AI_KEY

# ── 4. tunnel ──────────────────────────────────────────────────────────────
$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared) { $cloudflared = "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe" }
if (-not (Test-Path $cloudflared)) { throw "cloudflared ontbreekt. Installeer: winget install --id Cloudflare.cloudflared" }

function Start-Tunnel {
  Get-Process cloudflared -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $cloudflared } | Stop-Process -Force -ErrorAction SilentlyContinue
  if (Test-Path $logFile) { Remove-Item $logFile -Force }
  $p = Start-Process -FilePath $cloudflared -ArgumentList "tunnel --no-autoupdate --url http://127.0.0.1:11500 --logfile `"$logFile`"" -WindowStyle Hidden -PassThru
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep 1
    if (Test-Path $logFile) {
      $m = Select-String -Path $logFile -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -AllMatches | Select-Object -First 1
      if ($m) { return @{ Proc = $p; Url = $m.Matches[0].Value } }
    }
  }
  throw "De tunnel kreeg geen adres. Controleer je internetverbinding."
}

Say "Tunnel openen"
$t = Start-Tunnel
Say "Tunnel: $($t.Url)"

$envText = @"
LLM_API_KEY=$key
AI_ALLOW_REMOTE=true
LLM_MODEL=$Model
LLM_FAST_MODEL=$FastModel
LLM_EMBED_MODEL=$EmbedModel
LLM_TIMEOUT_MS=90000
"@
if ($firstRun) {
  Set-Clipboard -Value $key
  Write-Host ""
  Write-Host "SNELSTE WEG (geen redeploy): plak de sleutel in ZekerFlex -> Admin -> Jarvis -> 'AI-node-sleutel' en klik Opslaan." -ForegroundColor Green
  Write-Host "De sleutel staat al op je klembord (Ctrl+V)." -ForegroundColor Green
  if ($ShowKey) { Write-Host "Sleutel: $key" }
  Write-Host ""
  Write-Host "ALTERNATIEF (env): zet deze 6 regels in Vercel -> Settings -> Environment Variables (Production) en Redeploy:" -ForegroundColor Yellow
  if ($ShowKey) { Write-Host $envText } else { Write-Host "(gebruik -ShowKey om de regels te tonen)" }
  Write-Host "LLM_BASE_URL laat je leeg/ongewijzigd: de site vindt de laptop zelf." -ForegroundColor Yellow
  Write-Host ""
}

# ── 5. aanmelden + bewaken ─────────────────────────────────────────────────────
$models = @($Model, $FastModel, $EmbedModel)
$warned = $false
Say "AI-node draait. Laat dit venster open (minimaliseren mag). Ctrl+C stopt."
while ($true) {
  if ($t.Proc.HasExited) { Say "Tunnel weggevallen — opnieuw openen"; $t = Start-Tunnel; Say "Nieuwe tunnel: $($t.Url)" }
  if ($proxy.HasExited) { Say "Beveiligingslaag herstarten"; $env:ZF_AI_KEY = $key; $proxy = Start-Process -FilePath $node -ArgumentList "`"$(Join-Path $here 'auth-proxy.mjs')`"" -WindowStyle Hidden -PassThru; Remove-Item Env:ZF_AI_KEY }
  if (-not (OllamaUp)) { Say "Ollama herstarten"; Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden }
  try {
    $body = @{ url = $t.Url; models = $models; name = $env:COMPUTERNAME } | ConvertTo-Json
    $r = Invoke-RestMethod -Method Post -Uri "$Site/api/internal/ai-node/register" -Headers @{ Authorization = "Bearer $key" } -ContentType "application/json" -Body $body -TimeoutSec 30
    if ($r.new) { Say "Aangemeld bij $Site — de live site gebruikt nu deze laptop." }
    $warned = $false
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if (-not $warned) {
      if ($code -eq 401) { Set-Clipboard -Value $key; Write-Host "  X ZekerFlex kent de sleutel nog niet. De sleutel staat op je klembord: plak 'm in Admin -> Jarvis -> 'AI-node-sleutel' en klik Opslaan (geen redeploy). Of zet LLM_API_KEY in Vercel en Redeploy." -ForegroundColor Red }
      else { Write-Host "  ✗ Aanmelden mislukt ($code): $($_.Exception.Message)" -ForegroundColor Red }
      $warned = $true
    }
  }
  Start-Sleep 60
}
