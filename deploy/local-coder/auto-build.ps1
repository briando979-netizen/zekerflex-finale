<#
  ZekerFlex - AUTONOME code-bouwer (gratis, op je Gemini-sleutel).
  Geef een taak in gewone taal; Aider zoekt zelf de juiste bestanden in de
  echte TypeScript-codebase, bewerkt ze, draait de typecheck en commit. Daarna
  doet dit script nog een harde eindcontrole (tsc) en pusht alleen als het
  schoon is. Dit is het verschil met Jarvis: een agent met echte tools, geen
  chat die losse code uitspuugt.

  Eenmalig:  $env:GEMINI_API_KEY = "jouw-sleutel"   (gratis: aistudio.google.com/apikey)

  Gebruik (vanuit de projectmap):
    powershell -ExecutionPolicy Bypass -File deploy\local-coder\auto-build.ps1 -Task "voeg een FAQ-sectie toe aan de prijzen-pagina"
    ... en met pushen naar GitHub:   -Push
#>
param(
  [Parameter(Mandatory = $true)][string]$Task,
  [string]$Model = "gemini/gemini-2.5-flash",
  [switch]$Push
)
$ErrorActionPreference = "Stop"
function Say($t) { Write-Host "> $t" -ForegroundColor Cyan }

if (-not $env:GEMINI_API_KEY) {
  throw "Zet eerst je gratis sleutel: `$env:GEMINI_API_KEY = 'jouw-sleutel' (via https://aistudio.google.com/apikey)"
}

# Aider aanwezig? zo niet: eenmalig installeren
$have = $false
try { if (python -m pip show aider-chat 2>$null) { $have = $true } } catch {}
if (-not $have) { Say "Aider installeren (eenmalig)"; python -m pip install --user --upgrade aider-chat }

Say "Autonome bouw gestart: $Task"
# --message = eenmalige opdracht (niet-interactief), --yes-always = alles zelf
# bevestigen, --auto-lint + --lint-cmd = na elke edit de typecheck draaien en
# fouten zelf herstellen, --auto-commits = per wijziging committen.
python -m aider `
  --model $Model `
  --message $Task `
  --yes-always `
  --auto-commits `
  --auto-lint `
  --lint-cmd "npx tsc --noEmit -p ." `
  --no-show-model-warnings

Say "Eindcontrole: TypeScript (golden rule)"
npx tsc --noEmit -p .
if ($LASTEXITCODE -ne 0) {
  Say "Er zijn nog TypeScript-fouten -> NIET gepusht. Bekijk 'git diff', of draai start-gemini-coder.ps1 om bij te sturen."
  exit 1
}
Say "Typecheck schoon."

if ($Push) {
  Say "Pushen naar GitHub (main)"
  git push origin HEAD
  Say "Gepusht. Live zetten op de VPS: ssh naar de server en 'sudo bash deploy/scripts/deploy-vps.sh' (of zet de GitHub self-host-deploy workflow aan)."
} else {
  Say "Niet gepusht. Controleer met 'git diff' / 'git log' en push zelf met 'git push' als je tevreden bent."
}
