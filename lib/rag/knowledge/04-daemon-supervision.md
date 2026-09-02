# Always-On daemon & achtergrondservices

`scripts/daemon.mjs` (`npm run daemon`) is de permanente draaimodus van de box.

## Wat het doet

1. **`.env` laden** — eigen mini-parser (geen dep), overschrijft de shell niet.
2. **Supervisor** — start `next dev -p 3000` (poort via `PORT`), `stdio: inherit`.
   Bij exit: herstart met exponentiële backoff (1s → 2s → ... cap 30s). Na 60s
   stabiel draaien reset de backoff. Na 30 crashes achter elkaar stopt de
   daemon met een luide melding.
3. **Interne scheduler** — wacht tot `/login` antwoordt, dan `setInterval` per job
   die een `POST` doet naar het interne endpoint met `x-internal-token`:

   | job | endpoint | interval |
   | --- | --- | --- |
   | ai-watchdog | `/api/internal/ai/watchdog` | 20s |
   | matching-tick | `/api/internal/matching/tick` | 60s |
   | active-hours | `/api/internal/active-hours/recompute` | 4u |
   | orchestration | `/api/internal/orchestration/tick` | 6u |
   | rag-reindex | `/api/internal/rag/reindex` | 12u |

   Timeout per request: 60s (300s voor reindex). Een `ECONNREFUSED`/abort tijdens
   een herstart wordt stil genegeerd — volgende tick pakt het weer op.
4. **Graceful shutdown** — SIGINT/SIGTERM: timers stoppen, child `SIGTERM`,
   exit na 1,5s. `uncaughtException`/`unhandledRejection` worden gelogd, niet fataal.

## Waarom geen `vercel.json`-cron lokaal

`vercel.json` bevat dezelfde jobs voor een cloud-deploy, maar die crons draaien
alleen op Vercel. De daemon vervangt ze lokaal, zodat de box zonder externe
scheduler blijft draaien.

## Interne endpoint-auth

`lib/internal-auth.ts#checkInternalToken(request)` accepteert de token via
`x-internal-token`, `Authorization: Bearer` of `?token=`. Zonder
`INTERNAL_CRON_TOKEN` gezet: in productie geweigerd (412), lokaal toegestaan
(de daemon logt een waarschuwing).

## De follow-up worker

`lib/notifications/worker.ts` is een `setInterval`-variant van
`processMatchingFollowups()`. Met de daemon is die overbodig — `matching/tick`
doet hetzelfde via het endpoint.

## Draaien als Windows-service (optioneel)

De daemon is een gewoon Node-proces. Voor echt "altijd aan" na herstart: wikkel
`npm run daemon` in NSSM, `pm2`, of een Windows Scheduled Task met trigger "At
startup". Docker (`zekerflex-postgres`, `redis-server`) start je met
`--restart unless-stopped`.
