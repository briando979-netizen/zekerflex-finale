<#
  ZekerFlex — lokale code-assistent als fallback wanneer je Claude-limiet op is.
  Draait Aider (AI pair-programmer in de terminal) op je EIGEN Ollama-model:
  gratis, offline, en ZONDER Anthropic-limiet. Minder slim dan Claude, maar
  genoeg om door te werken aan kleine features/fixes.

  Start (PowerShell, vanuit de projectmap):
    powershell -ExecutionPolicy Bypass -File deploy\local-coder\start-local-coder.ps1

  Beter voor code (eenmalig downloaden, ~4.7 GB):  -Model qwen2.5-coder:7b
#>
param([string]$Model = "llama3.1:8b")
$ErrorActionPreference = "Stop"
function Say($t) { Write-Host "> $t" -ForegroundColor Cyan }

# 1. Ollama draait?
try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:11434/api/version" -TimeoutSec 3 | Out-Null }
catch {
  Say "Ollama starten"
  $ol = (Get-Command ollama -ErrorAction SilentlyContinue).Source
  if (-not $ol) { $ol = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe" }
  if (-not (Test-Path $ol)) { throw "Ollama ontbreekt. Installeer via https://ollama.com/download" }
  Start-Process -FilePath $ol -ArgumentList "serve" -WindowStyle Hidden
  Start-Sleep 3
}

# 2. Model aanwezig? zo niet: downloaden
if (-not ((& ollama list) -match [regex]::Escape($Model))) {
  Say "Model downloaden: $Model (kan even duren)"
  & ollama pull $Model
}

# 3. Aider aanwezig? zo niet: eenmalig installeren
$have = $false
try { if (python -m pip show aider-chat 2>$null) { $have = $true } } catch {}
if (-not $have) {
  Say "Aider installeren (eenmalig)"
  python -m pip install --user --upgrade aider-chat
}

# 4. Starten op het lokale model, in deze projectmap (aider commit zelf in git)
$env:OLLAMA_API_BASE = "http://127.0.0.1:11434"
Say "Aider start op ollama/$Model. Typ je opdracht; /help = commando's; Ctrl+C = stoppen."
Say "Tip: verwijs naar bestanden met /add <pad>, bv. /add app/(marketing)/personeel-inhuren/page.tsx"
python -m aider --model "ollama/$Model" --no-show-model-warnings
if ($LASTEXITCODE -ne 0) {
  Say "Lukt 'python -m aider' niet? Probeer het directe commando:"
  Write-Host "   aider --model ollama/$Model" -ForegroundColor Yellow
}
