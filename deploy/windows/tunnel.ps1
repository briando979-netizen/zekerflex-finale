# Snelste gratis manier om ZekerFlex online te zetten als het AL lokaal draait.
# Opent een gratis publieke Cloudflare-URL naar je lokale app (standaard poort 3000)
# en zet de laptop zo dat hij bij dichtklappen (aan de stroom) blijft draaien.
#
# Draai eerst ZekerFlex lokaal (bv. in een andere terminal: npm run start), en dan:
#   powershell -ExecutionPolicy Bypass -File deploy\windows\tunnel.ps1
#   (andere poort:)  ... -File deploy\windows\tunnel.ps1 -Port 3100
#
# EERLIJK: een laptop die slaapt of uit staat draait niets. Laat 'm aan de oplader.
param([int]$Port = 3000)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot

Write-Host "==> Stroominstellingen: niet slapen aan de stroom, dichtklappen = blijft draaien"
try {
  powercfg /change standby-timeout-ac 0
  powercfg /change hibernate-timeout-ac 0
  powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
  powercfg /setactive SCHEME_CURRENT
  Write-Host "    OK - laat de laptop WEL aan de oplader staan."
} catch {
  Write-Warning "Stroominstellingen vereisen Administrator (anders handmatig in Energiebeheer)."
}

Write-Host "==> Controleren of er iets draait op poort $Port"
try {
  Invoke-WebRequest "http://localhost:$Port" -UseBasicParsing -TimeoutSec 5 | Out-Null
  Write-Host "    OK - app bereikbaar op poort $Port."
} catch {
  Write-Warning "Er lijkt nog niets te draaien op poort $Port. Start eerst ZekerFlex lokaal (bv. 'npm run start') en draai dit opnieuw. Ik ga toch door; de tunnel wacht vanzelf."
}

$cf = Join-Path $here "cloudflared.exe"
if (-not (Test-Path $cf)) {
  Write-Host "==> cloudflared downloaden (gratis tunnel)"
  Invoke-WebRequest "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cf
}

Write-Host "==> Gratis publieke URL openen. Hij verschijnt zo hieronder - LAAT DIT VENSTER OPEN."
& $cf tunnel --url "http://localhost:$Port"
