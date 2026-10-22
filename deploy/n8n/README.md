# Brein n8n — ZekerFlex-automatiseringen op je eigen server

n8n verbindt het ZekerFlex-brein met de rest van je bedrijf: Slack/Teams, mail,
spreadsheets, je CRM. Alles draait op je eigen server; er gaat niets naar een
externe automatiseringsdienst.

## Installeren

```bash
cd deploy/n8n
cp .env.example .env      # vul N8N_HOST, N8N_ENCRYPTION_KEY, ZEKERFLEX_API_KEY in
docker compose up -d
```

- Wijs de DNS van `N8N_HOST` (bijv. `n8n.zekerflex.com`) naar de server. Caddy regelt HTTPS zelf.
- De **API-sleutel** maak je in ZekerFlex:
  - Admin → API-sleutels, zonder organisatie: het brein antwoordt als admin, met platformcijfers en interne kennis.
  - Werkgever → Integraties: het brein antwoordt als die opdrachtgever, alleen met eigen gegevens.
  - De sleutel heeft de scope **`brain:ask`** nodig.
- Extra variabelen voor de voorbeelden: `SLACK_WEBHOOK_URL`, `BRIEFING_FROM` en `BRIEFING_TO` in `.env`.

## De koppeling

`POST {ZEKERFLEX_BASE_URL}/api/public/v1/brain` met `Authorization: Bearer zf_live_…`

```json
{ "question": "Welke klussen zijn nog niet bezet?", "context": { "optioneel": "data uit je workflow" } }
```

Je krijgt terug: `{ "answer", "mode", "tools", "sources", "links" }`.

- Het is hetzelfde brein als in de app: agentic RAG, CAG en alleen-lezen tools op de eigen gegevens.
- Elke aanroep staat los van de vorige; er is geen gespreksgeheugen.
- `context` geldt als **gegevens**, niet als opdracht. Het brein voert nooit iets uit.

## Voorbeeld-workflows (`workflows/`)

Importeer ze via n8n → Workflows → Import from file.

| Bestand | Wat het doet |
|---|---|
| `01-brein-vraag-webhook.json` | Eigen webhook `/webhook/zekerflex-brein`: stuur een vraag, krijg het antwoord van het brein terug. |
| `02-gebeurtenis-naar-slack.json` | Een ZekerFlex-webhook komt binnen (bijv. `timesheet.approved` of `invoice.issued`). De handtekening wordt gecontroleerd, het brein vat de gebeurtenis samen en het resultaat gaat naar Slack/Teams. Aanmelden: Werkgever → Integraties → Webhooks, URL `https://N8N_HOST/webhook/zekerflex-events`. |
| `03-dagelijkse-briefing.json` | Elke werkdag om 08:00 vraagt n8n het brein om een overzicht en mailt dat. Een SMTP-credential stel je in n8n in. |
