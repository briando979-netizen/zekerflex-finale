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
0 4 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/active-hours/recompute"
0 6 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/orchestration/tick"
0 12 * * * wget -q -O /dev/null -T 600 "$H" "$APP/api/internal/rag/reindex"
0 8 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/sales/tick"
0 7 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/ai/watchdog"
0 5 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/payroll/abu-phase-sweep"
0 9 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/claims/collections-sweep"
30 5 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/agenda/sweep"
15 6 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/bank/fees"
0 17 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/notifications/tick"
0 10 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/worker/milestones"
0 11 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/seo/indexnow"
0 6 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/autopilot/tick"
0 15 * * * wget -q -O /dev/null -T 300 "$H" "$APP/api/internal/autopilot/tick"
0 7 1 * * wget -q -O /dev/null -T 600 "$H" "$APP/api/internal/pensioen/aangifte"
EOF

echo "[zf-cron] crontab geïnstalleerd; crond start (UTC). Doel: $APP"
exec crond -f -l 8