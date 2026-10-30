<#
  ZekerFlex - gratis code-agent op je eigen Gemini-sleutel.
  Draait Aider (AI pair-programmer met ECHTE bestands-/git-tools) op Google
  Gemini. Gratis binnen Google's gratis laag, en veel beter in code dan een
  klein lokaal model. Aider bewerkt de echte TypeScript-codebase en commit zelf.

  Eenmalig je gratis sleutel zetten (PowerShell):
    $env:GEMINI_API_KEY = "jouw-sleutel-van-aistudio.google.com/apikey"

  Starten (vanuit de projectmap):
    powershell -ExecutionPolicy Bypass -File deploy\local-coder\start-gemini-coder.ps1

  Ander model: -Model gemini/gemini-2.5-pro  (slimmer, strengere gratis limiet)
#>
param([string]$Model = "gemini/gemini-2.5-flash")
$ErrorActionPreference = "Stop"
function Say($t) { Write-Host "> $t" -ForegroundColor Cyan }

if (-not $env:GEMINI_API_KEY) {
  Write-Host "Geen GEMINI_API_KEY gevonden." -ForegroundColor Yellow
  Write-Host "Zet 'm eerst (gratis, via https://aistudio.google.com/apikey):" -ForegroundColor Yellow
  Write-Host '   $env:GEMINI_API_KEY = "jouw-sleutel"' -ForegroundColor Yellow
  throw "GEMINI_API_KEY ontbreekt"
}

# Aider aanwezig? zo niet: eenmalig installeren
$have = $false
try { if (python -m pip show aider-chat 2>$null) { $have = $true } } catch {}
if (-not $have) {
  Say "Aider installeren (eenmalig, via pip)"
  python -m pip install --user --upgrade aider-chat
}

Say "Aider start op $Model (gratis Gemini). Typ je opdracht in gewone taal."
Say "Geef bestanden mee met /add <pad>, bv. /add app/(marketing)/prijzen/page.tsx"
Say "Aider test + commit zelf; Ctrl+C = stoppen. Push doe je met 'git push' als je tevreden bent."

# --auto-lint laat Aider na elke edit de typecheck draaien en fouten zelf fixen.
python -m aider `
  --model $Model `
  --auto-commits `
  --auto-lint `
  --lint-cmd "npx tsc --noEmit -p ." `
  --no-show-model-warnings

if ($LASTEXITCODE -ne 0) {
  Say "Lukt 'python -m aider' niet? Probeer direct: aider --model $Model"
  Say "Onbekend model? Aider toont bij de fout welke Gemini-modellen beschikbaar zijn; kies er een met -Model."
}
