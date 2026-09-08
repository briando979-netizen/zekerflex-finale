# ZekerFlex API & Developer Gateway

De B2B API staat onder `/api/public/v1`. Gebruik een sleutel die in het admin-dashboard is aangemaakt via **API & integraties**.

## Authenticatie

Stuur de sleutel als:

```http
Authorization: Bearer zf_live_...
```

`X-API-Key: zf_live_...` wordt ook ondersteund. De volledige sleutel wordt alleen bij aanmaken getoond. In de database staat uitsluitend een SHA-256 hash.

Elke sleutel is aan maximaal één organisatie gekoppeld. Requests zijn beperkt tot 120 per minuut per sleutel.

## Scopes

| Scope | Endpoint |
|---|---|
| `shifts:read` | Open diensten lezen |
| `shifts:write` | Een dienst aanmaken |
| `timesheets:read` | Goedgekeurde urenstaten lezen |
| `webhooks:manage` | Webhook-endpoint registreren |
| `invoices:read` | Gereserveerd voor factuurexport |
| `users:read` | Gereserveerd voor eigen organisatie |

## Endpoints

```bash
curl -H "Authorization: Bearer zf_live_..." \
  https://app.zekerflex.com/api/public/v1/shifts

curl -X POST -H "Authorization: Bearer zf_live_..." \
  -H "Content-Type: application/json" \
  -d '{"branchId":"...","title":"Magazijnmedewerker","startsAt":"2026-10-01T08:00:00+02:00","endsAt":"2026-10-01T16:30:00+02:00","breakMinutes":30,"hourlyRateCents":1600,"positions":2}' \
  https://app.zekerflex.com/api/public/v1/shifts

curl -H "X-API-Key: zf_live_..." \
  https://app.zekerflex.com/api/public/v1/timesheets/approved
```

## Webhooks

Registreer met `POST /api/public/v1/webhooks` en geef `url` en `eventTypes` mee. Het responseveld `secret` wordt eenmalig teruggegeven.

Elke delivery bevat:

- `X-ZekerFlex-Event`
- `X-ZekerFlex-Timestamp`
- `X-ZekerFlex-Signature: v1=<hex>`

Bereken de handtekening met HMAC-SHA256 over `<timestamp>.<raw request body>`. Verifieer de timestamp tegen replay-aanvallen. ZekerFlex probeert maximaal vijf keer met exponentiële wachttijd en bewaart de deliverystatus.

Beschikbare events: `shift.matched`, `freelancer.checked_in`, `timesheet.approved`, `dispute.opened`.

API-fouten gebruiken JSON met `error.code` en `error.message`. Bewaar de `id` uit responses voor idempotente verwerking in je eigen systeem.
