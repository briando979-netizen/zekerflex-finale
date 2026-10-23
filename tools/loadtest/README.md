# Load-/stresstest-harnas

Beantwoordt: wat gebeurt er als er op vrijdag 17:00 duizenden flexwerkers
tegelijk hun uren indienen of een melding openen? Hoe houden de API-routes zich
onder piekbelasting?

> **Draai dit tegen een STAGING-omgeving**, niet tegen productie met echte
> gebruikers. De harnas raakt alleen publieke, alleen-lezen endpoints — geen
> login, geen schrijfacties — zodat er niets muteert en geen account op slot gaat.

## Snel (zonder installatie, Node 20+)

```bash
BASE_URL=https://staging.zekerflex.com CONCURRENCY=200 DURATION=30 \
  node tools/loadtest/run.mjs
```

- `CONCURRENCY` — gelijktijdige "gebruikers" (begin met 100, schroef op).
- `DURATION` — seconden.
- `ENDPOINTS="/klussen,/api/status"` — eigen set i.p.v. de standaard.

Rapporteert per endpoint en totaal: aantal verzoeken, foutpercentage, doorvoer
(req/s) en latency p50/p95/p99. Exitcode 1 als het foutpercentage > 2% of p95 >
3000 ms — handig om in CI op te laten falen.

## Serieus (k6, met ramp + spike)

Installeer [k6](https://k6.io/docs/get-started/installation/), dan:

```bash
BASE_URL=https://staging.zekerflex.com k6 run tools/loadtest/k6-spike.js
```

Scenario: normale drukte → plotselinge piek naar 1500 virtuele gebruikers →
herstel. Drempels: < 2% fouten en p95 < 3 s, anders faalt de run.

## Interpreteren

- **p95 loopt op maar foutpercentage blijft laag** → de functions schalen, maar
  trager; overweeg caching of een hogere Fluid-Compute-concurrency.
- **Foutpercentage stijgt (5xx / timeouts)** → een bottleneck: meestal de
  database (Neon-connectielimiet) of de cache (Upstash Redis-quota — zie het
  Redis-incident). Dat zijn de eerste plekken om te schalen.
- **429's** → rate-limiting grijpt in; verwacht en gewenst bij echt extreme pieken.

## Waarom alleen-lezen?

Het indienen van uren, inloggen en betalen zijn schrijfacties met echte
gevolgen. De read-paden (marktplaats, status, kennisbank, homepage) delen
dezelfde functions, database en cache, dus hun gedrag onder druk voorspelt de
hele stack. Wil je schrijf-load testen, doe dat met wegwerp-accounts op een
aparte testdatabase — nooit op productie.
