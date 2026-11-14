#!/bin/sh
# ZekerFlex self-host cron-runner. Op Vercel triggerde Vercel-Cron de interne
# endpoints; zelf-gehost is er geen scheduler, dus deze service doet dat. Ze
# raken de app op het interne netwerk (http://app:3000) en authenticeren met
# INTERNAL_CRON_TOKEN (lib/internal-auth.ts). Tijden in UTC, exact de schedules
# uit vercel.json. Draait busybox crond (zit in alpine).
set -eu
: "${INTERNAL_CRON_TOKEN:?INTERNAL_CRON_TOKEN ontbreekt in de omgeving}"
APP="${CRON_TARGET:-http://app:3000}"
H="--header=x-internal-token: ${INTERNAL_CRON_TOKEN}"

mkdir -p /etc/crontabs
cat > /etc/crontabs/root <<EOF
0 3 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/matching/tick"
# AVG-bewaartermijnen (lib/privacy/sweep.ts): o.a. selfies van de ID-controle na 30 dagen weg, oude GPS-punten, verlopen resetcodes.
# Stond sinds de verhuizing naar de VPS nergens ingepland (gemeten 12 nov: ID-gegevens van 14 sep stonden er nog).
40 3 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/privacy/retention-sweep"
# Klussen na afloop (eindtijd > 2 uur voorbij, nog iemand erop) naar Afgerond; zonder inschrijving blijft een klus open (lib/shifts/verlopen.ts).
# Doet niets zolang de vlag klussen-verlopen-sluiten uit staat: dan telt hij alleen (KV meting:klussen-verlopen).
20 3 * * * wget -q -O /dev/null -T 120 "$H" "$APP/api/internal/klussen/verlopen"
# Elk uur het testwerkeraccount van de eigenaar terug naar "net aangemeld" (lib/testwerker/reset.ts); zonder TESTWERKER_EMAIL doet hij niets.
5 * * * * wget -q -O /dev/null -T 120 "$H" "$APP/api/internal/testwerker/reset"
# Nachtelijke rondgang langs elke openbare pagina; wat kapot is komt in het foutenlogboek (lib/ops/rondgang.ts).
20 4 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/rondgang"
0 4 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/active-hours/recompute"
0 6 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/orchestration/tick"
# RAG twee keer per dag (de route zegt "elke ~12 uur"): valt één run weg door een uitrol, dan blijft de hartslag (26 u) toch vers
# :25 en niet :00: om middernacht en 12:00 draaien ook social/tick en ai/warm; samen bezetten ze het eigen model (13 nov, meting 17: embed timeout)
25 0,12 * * * wget -q -O /dev/null -T 600 "$H" "$APP/api/internal/rag/reindex"
# de herkansing van de RAG-index na een uitrol (lib/rag/herkansing.ts); zonder herkansing klaar in een paar ms
*/15 * * * * wget -q -O /dev/null -T 600 "$H" "$APP/api/internal/rag/reindex?herkansing=1"
# momentopname van de Kennisgraaf voor de groeireeks in Admin -> Kennisgraaf (lib/rag/graph.ts), na de herindexering van 00:25
10 1 * * * wget -q -O /dev/null -T 120 "$H" "$APP/api/internal/kennisgraaf/snapshot"
0 8 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/sales/tick"
0 8,12,16 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/sales/offers-sweep"
0 7 * * * wget -q -O /dev/null -T 120 "$H" "$APP/api/internal/scans/dagoverzicht"
# elke 15 min: verzegelde chipgegevens (MRZ-sleutel, chipsessies, uitslagen) echt wissen als ze te oud zijn (lib/kyc/chip/sessie.ts)
*/15 * * * * wget -q -O /dev/null -T 60 "$H" "$APP/api/internal/kyc/chip-opruimen"
# KVK-controles die wachtten op tegoed of de minuutlimiet bij KVKBase opnieuw doen (lib/kvk/herkansing.ts)
*/30 * * * * wget -q -O /dev/null -T 120 "$H" "$APP/api/internal/kvk/herkansing"
# elke 15 min: staat het live Stripe-account nog open voor betalingen? Zo niet: melding aan de eigenaar en bankcontrole op het bankafschrift (lib/billing/stripe-betalen.ts)
*/15 * * * * wget -q -O /dev/null -T 60 "$H" "$APP/api/internal/stripe/account-stand"
15 6 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/winkel-agent/tick"
# elk kwartier: de productlijst voor AI-assistenten bij Stripe bijwerken, alleen wat veranderde (lib/shop/agent-handel-server.ts)
*/15 * * * * wget -q -O /dev/null -T 120 "$H" "$APP/api/internal/shop/agent-catalogus"
30 6 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/markten/tick"
0 7 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/ai/watchdog"
# Eigen taalmodel warm houden (alleen met "alles gratis" aan): na een afgeschoten model staat het binnen 4 min weer klaar.
*/4 * * * * wget -q -O /dev/null -T 150 "$H" "$APP/api/internal/ai/warm"
0 5 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/payroll/abu-phase-sweep"
0 9 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/claims/collections-sweep"
30 5 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/agenda/sweep"
15 6 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/bank/fees"
0 17 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/notifications/tick"
0 10 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/worker/milestones"
0 11 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/seo/indexnow"
# 06:20 en niet 06:00: dan draait orchestration/tick al; samen hielden ze gemma bezig en kreeg de RAG-embedding een time-out (13 nov, meting 17)
20 6 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/autopilot/tick"
0 15 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/autopilot/tick"
0 7 1 * * wget -q -O /dev/null -T 600 "$H" "$APP/api/internal/pensioen/aangifte"
30 3 * * * wget -q -O /dev/null -T 120 "$H" "$APP/api/internal/backup/check"
15 * * * * wget -q -O /dev/null -T 60 "$H" "$APP/api/internal/backup/check?alleen=schijf"
# elke 10 min: het geheugen van de server meten en de eigenaar waarschuwen voor het te laat is (lib/ops/geheugen.ts)
*/10 * * * * wget -q -O /dev/null -T 30 "$H" "$APP/api/internal/backup/check?alleen=geheugen"
*/5 * * * * wget -q -O /dev/null -T 120 "$H" "$APP/api/internal/website/uptime"
0 6 * * 1 wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/website/weekly-check"
30 1 * * * wget -q -O /dev/null -T 60 "$H" "$APP/api/internal/website/site-backups"
45 4 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/website-check/opruimen"
55 4 * * * wget -q -O /dev/null -T 120 "$H" "$APP/api/internal/sitechat/opruimen"
# Klantgegevens in afspraken na 2 jaar wissen (naam, telefoon, e-mail, opmerking; de afspraak blijft als lege regel).
5 5 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/afspraken/bewaartermijn"
# elk uur (op :10): klanten met een e-mailadres 24 uur voor hun online afspraak een herinnering mailen (lib/afspraken/herinneringen.ts)
10 * * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/afspraken/herinneringen"
0 17 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/rijschool/herinneringen"
*/30 * * * * wget -q -O /dev/null -T 120 "$H" "$APP/api/internal/bouwer/auto"
*/2 * * * * wget -q -O /dev/null -T 60 "$H" "$APP/api/internal/bouwer/meldingen"
# elke 2 min: Auto-uitrol, de nieuwste main controleren en zonder database-wijziging vanzelf live zetten (lib/bouwer/auto-uitrol.ts); doet niets zolang de vlag auto-uitrol uit staat
*/2 * * * * wget -q -O /dev/null -T 90 "$H" "$APP/api/internal/auto-uitrol"
# elk uur: Metabase inrichten als dat nog niet lukte, en om 04:00 de views en kaarten bijwerken (lib/bi)
40 * * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/bi/setup"
# elk uur op :35: terugkaatsers (bounces) in de postbus nalezen (lib/mail/bounce-ronde.ts); doet alleen tellen zolang de vlag mail-bounce-verwerken uit staat
35 * * * * wget -q -O /dev/null -T 120 "$H" "$APP/api/internal/mail/bounces"
# elk uur: bronnen van buiten ophalen die aan de beurt zijn (pompprijzen, minimumloon, cao, KVK, schermcontrole)
20 * * * * wget -q -O /dev/null -T 600 "$H" "$APP/api/internal/bronnen/tick"
# elke 10 min: AI-opdrachten van de video-editor op de achtergrond afwerken (antwoordt meteen)
*/10 * * * * wget -q -O /dev/null -T 30 "$H" "$APP/api/internal/video/wachtrij"
# elke 10 min: goedgekeurde berichten voor sociale media plaatsen en, als de autopilot aan staat, een week klaarzetten (lib/social/publiceer.ts)
*/10 * * * * wget -q -O /dev/null -T 280 "$H" "$APP/api/internal/social/tick"
# elke 10 min: de nieuwste GitHub main alvast controleren in de Bouwer (tsc, eslint, tests; antwoordt meteen)
*/10 * * * * wget -q -O /dev/null -T 60 "$H" "$APP/api/internal/controles/tick"
# elke 10 min: bonnetjes (bonnetjes@) uit de Postvak halen en boeken of klaarzetten; doet niets zolang de vlag boekhouding-bonnen-mail uit staat (lib/boekhouding/bonnen/mail-taak.ts)
*/10 * * * * wget -q -O /dev/null -T 90 "$H" "$APP/api/internal/boekhouding/bonnen-mail"
# elke nacht 02:40 UTC: facturen boeken, bank koppelen (alleen wat zeker is), btw-concept bijwerken en deadlinemeldingen; doet niets zolang de vlag boekhouding-nachtronde uit staat (lib/boekhouding/nachtronde.ts)
40 2 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/boekhouding/nachtronde"
EOF

echo "[zf-cron] crontab geïnstalleerd; crond start (UTC). Doel: $APP"
exec crond -f -l 8