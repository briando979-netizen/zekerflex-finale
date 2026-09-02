# Soevereine analytics (lokaal alternatief voor Google Analytics)

Alles blijft binnen de box: geen cookies, geen third-party script, geen
verbinding met externe trackers.

## Client — `components/analytics/AnalyticsBeacon.tsx`

Gemount in `app/layout.tsx` (Suspense-wrapped voor `usePathname`).

- **Sessie-id** = random string in `sessionStorage` (`zekerflex.analytics.sid`).
  Géén cookie; verdwijnt als het tabblad sluit.
- Stuurt automatisch een `PAGEVIEW` bij navigatie.
- Globale click-listener (capture): op `[data-track]`, `<button>` of `<a>` →
  `CLICK` met een label (`data-track` > `aria-label` > tekst).
- Gebatcht (1,5s), `navigator.sendBeacon` bij `pagehide`/`visibilitychange`.
- `trackEvent(type, label?, meta?)` is exporteerbaar voor custom events.

## Endpoint — `POST /api/analytics/track`

Publiek (bezoekers zijn niet ingelogd). Body:
`{ sessionId, events: [{ type, path, label?, referrer?, meta? }] }` (max 20).

`lib/analytics/track.ts#trackEvents`:

- Per-sessie rate-limit in Redis (`analytics:rate:<minuut>:<sid>`, 240/min),
  **fail-open** — analytics mag nooit een pagina blokkeren.
- `path` genormaliseerd, `referrerHost` uit de URL gehaald.
- User-agent **alleen als sha256[:16]** opgeslagen, nooit ruw.
- `userId` alleen als de request toevallig een sessie meestuurt.

## Model — `AnalyticsEvent`

`type` (PAGEVIEW | CLICK | INTERACTION | CUSTOM), `path`, `referrerHost`,
`sessionId`, `userId?`, `label?`, `meta`, `uaHash?`, `createdAt`. Indexen op
`createdAt`, `(type, createdAt)`, `(path, createdAt)`, `(sessionId, createdAt)`.

## Dashboard — `/admin/analytics` (PLATFORM_ADMIN)

`components/analytics/TrafficDashboard.tsx` pollt elke 4s
`GET /api/admin/analytics/live` en éénmalig `/summary?days=7`:

- `liveTraffic()` — actieve bezoekers (unieke sessies in 5 min), pageviews
  5 min / vandaag, bezoekers vandaag, actieve pagina's, laatste kliks.
- `trafficSummary(days)` — per dag pageviews + bezoekers, top-pagina's,
  top-verwijzers.

## Jarvis-koppeling

`lib/voice/briefing.ts#gatherBriefingData` roept `liveTraffic()` aan; de
gesproken briefing bevat *"X bezoekers vandaag, Y nu actief op de site"*.

## Retentie

Er is **geen purge-cron**. Wil je oude events opruimen, doe dat expliciet en
bewust; het gebeurt nooit vanzelf.
