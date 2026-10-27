<#
  ZekerFlex — Codex (OpenAI's coding agent): zelfde terminal-weergave/ervaring als
  Claude Code, maar op je OpenAI/ChatGPT-account = een APARTE limiet dan Anthropic.
  Zo werk je gewoon door als Claude hier op zit.

  Start (PowerShell, vanuit de projectmap):
    powershell -ExecutionPolicy Bypass -File deploy\local-coder\start-codex.ps1

  De eerste keer logt Codex je in (ChatGPT-account of een OpenAI-API-sleutel).
  Kost OpenAI-credits/-abonnement, los van je Anthropic-limiet.
#>
$ErrorActionPreference = "Stop"
function Say($t) { Write-Host "> $t" -ForegroundColor Cyan }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js ontbreekt (nodig voor Codex). https://nodejs.org" }

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  Say "Codex installeren (eenmalig)"
  npm install -g @openai/codex
}

Say "Codex start in deze projectmap. Eerste keer: log in met je ChatGPT-account of OpenAI-API-sleutel."
Say "Gratis alternatief met dezelfde agentische look: Cline of Roo Code (VS Code-extensie), gericht op je lokale Ollama."
codex
