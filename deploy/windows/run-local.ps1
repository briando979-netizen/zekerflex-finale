# ZekerFlex thuis draaien - GRATIS en publiek bereikbaar, zonder Vercel.
# Zet je laptop zo dat hij bij DICHTKLAPPEN blijft draaien (aan de stroom),
# start de hele stack in Docker, en opent een gratis publieke URL via Cloudflare.
#
# Draai in PowerShell (als Administrator voor de stroominstellingen):
#   powershell -ExecutionPolicy Bypass -File deploy\windows\run-local.ps1
#   (of met eigen domein:)  ... -File deploy\windows\run-local.ps1 -Domain jouwdomein.nl
#
# EERLIJK: een laptop die SLAAPT of UIT staat rekent niet - niets kan dan draaien.
# Dit script zet "niet slapen aan de stroom" en "dichtklappen = blijven draaien",
# dus laat de laptop aan de oplader staan. Voor een vaste publieke URL (i.p.v. een
# tijdelijke) gebruik je een named Cloudflare-tunnel; zie README.md.
param([string]$Domain = "")
$ErrorActionPreference = "Stop"

# Naar de repo-root (deploy/windows -> ../../)
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo

Write-Host "==> Stroominstellingen: niet slapen aan de stroom, dichtklappen = blijft draaien"
try {
  powercfg /change standby-timeout-ac 0
  powercfg /change hibernate-timeout-ac 0
  powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
  powercfg /setactive SCHEME_CURRENT
  Write-Host "    OK - laat de laptop WEL aan de oplader staan."
} catch {
  Write-Warning "Stroominstellingen vereisen Administrator. Zet anders handmatig: Energiebeheer, 'Als ik de klep sluit', Niets doen (netstroom)."
}

Write-Host "==> Docker controleren"
docker info *> $null
if ($LASTEXITCODE -ne 0) { Write-Error "Docker Desktop draait niet. Start Docker Desktop en probeer opnieuw."; exit 1 }

if (-not (Test-Path ".env.production")) {
  if (-not $Domain) { $Domain = Read-Host "Domein (Enter = gratis tijdelijke URL)" }
  Write-Host "==> Secrets genereren en .env.production automatisch invullen"
  $gen = docker run --rm -v "${repo}\deploy\scripts:/s:ro" node:22-alpine node /s/gen-secrets.mjs
  function Val($k) {
    foreach ($line in $gen) { if ($line -match "^$k=(.*)") { return $Matches[1].Trim() } }
    return ""
  }
  $AUTH = Val "AUTH_SECRET"; $CRON = Val "INTERNAL_CRON_TOKEN"; $PG = Val "POSTGRES_PASSWORD"
  $VPUB = Val "WEBPUSH_VAPID_PUBLIC_KEY"; $VPRIV = Val "WEBPUSH_VAPID_PRIVATE_KEY"; $TURN = Val "TURN_SHARED_SECRET"
  if ($Domain) { $base = "https://$Domain"; $dom = $Domain } else { $base = "http://localhost:3000"; $dom = "localhost" }

  Copy-Item deploy\.env.production.example .env.production -Force
  $c = Get-Content .env.production
  $c = $c -replace '^APP_BASE_URL=.*', "APP_BASE_URL=$base"
  $c = $c -replace '^AUTH_URL=.*', "AUTH_URL=$base"
  $c = $c -replace '^AUTH_SECRET=.*', "AUTH_SECRET=$AUTH"
  $c = $c -replace '^INTERNAL_CRON_TOKEN=.*', "INTERNAL_CRON_TOKEN=$CRON"
  $c = $c -replace '^POSTGRES_PASSWORD=.*', "POSTGRES_PASSWORD=$PG"
  $c = $c -replace '^DATABASE_URL=.*', "DATABASE_URL=postgresql://zekerflex:$PG@postgres:5432/zekerflex?schema=public"
  $c = $c -replace '^WEBPUSH_VAPID_PUBLIC_KEY=.*', "WEBPUSH_VAPID_PUBLIC_KEY=$VPUB"
  $c = $c -replace '^WEBPUSH_VAPID_PRIVATE_KEY=.*', "WEBPUSH_VAPID_PRIVATE_KEY=$VPRIV"
  $c = $c -replace '^TURN_SHARED_SECRET=.*', "TURN_SHARED_SECRET=$TURN"
  $c = $c -replace '^MAIL_FROM=.*', "MAIL_FROM=noreply@$dom"
  $c = $c -replace '^MAIL_DOMAIN=.*', "MAIL_DOMAIN=$dom"
  Set-Content .env.production $c -Encoding utf8
  Write-Host "    .env.production aangemaakt."
}

Write-Host "==> ZekerFlex starten (Docker, eerste keer bouwt, duurt even)"
docker compose -f docker-compose.prod.yml up -d --build

Write-Host "==> Databasemigraties toepassen (eenmalig op een lege database)"
docker compose -f docker-compose.prod.yml run --rm --no-deps app npx prisma migrate deploy

$cf = Join-Path $repo "deploy\windows\cloudflared.exe"
if (-not (Test-Path $cf)) {
  Write-Host "==> cloudflared downloaden (gratis tunnel)"
  Invoke-WebRequest "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cf
}

Write-Host "==> Gratis publieke tunnel starten. De URL verschijnt zo (laat dit venster OPEN)."
Write-Host "    Voor een vaste URL op je eigen domein: zie deploy\windows\README.md"
& $cf tunnel --url http://localhost:3000
