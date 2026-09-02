# Omgevingsvariabelen — referentie

Bron van waarheid: [`lib/env.ts`](../lib/env.ts) (Zod-schema, valideert bij het
opstarten). Elke variabele hieronder heeft een veilige default tenzij anders
vermeld. Lokaal lees je uit `.env` / `.env.local`; op de VPS uit
`.env.production` (zie [`deploy/`](../deploy/README.md)).

**Legenda:** 🔴 vereist in productie · 🟡 aanrader · ⚪ optioneel

---

## Kern

| Variabele | Lokaal (dev) | VPS (prod) | Wat het doet |
|---|---|---|---|
| `NODE_ENV` | `development` | `production` 🔴 | Zet cookie-security, logging, caching |
| `APP_BASE_URL` | `http://localhost:3000` | `https://app.jouwdomein.com` 🔴 | Publieke URL — links in e-mails, OAuth-redirects, KYC-callback, VAPID-audience |
| `AUTH_URL` | — | `https://app.jouwdomein.com` 🔴 | NextAuth base-URL (achter de tunnel) |
| `AUTH_TRUST_HOST` | `true` | `true` 🔴 | Vertrouw de `X-Forwarded-*` headers van cloudflared |
| `AUTH_SECRET` | dev-string | 32+ random (`gen-secrets`) 🔴 | Ondertekent de sessie-JWT's |
| `INTERNAL_CRON_TOKEN` | dev-string | 16+ random 🟡 | Beschermt de interne worker-endpoints |
| `DATABASE_URL` | `postgresql://zekerflex:zekerflex@localhost:5432/zekerflex?schema=public` | `…@postgres:5432/…` 🔴 | PostgreSQL-verbinding |
| `POSTGRES_PASSWORD` | — | sterk wachtwoord 🔴 | Alleen gelezen door `docker-compose.prod.yml` |
| `REDIS_URL` | `redis://localhost:6379` | `redis://redis:6379` 🔴 | Locks, wachtrijen, rate-limits, AI-governor |
| `CLOUDFLARE_TUNNEL_TOKEN` | — | uit Cloudflare-dashboard 🔴 | Verbindt `cloudflared` met je tunnel |

## Zelf-gehoste AI (Ollama)

| Variabele | Default | Wat het doet |
|---|---|---|
| `LLM_BASE_URL` | `http://localhost:11434/v1` (prod: `http://ollama:11434/v1`) | OpenAI-compatibel endpoint |
| `LLM_MODEL` | `llama3.1:8b` (aanrader prod: `qwen2.5:3b`) | Hoofdmodel voor tools/redenering |
| `LLM_FAST_MODEL` | — (valt terug op `LLM_MODEL`) | Klein snel model voor begroetingen/routing/korte chat |
| `LLM_EMBED_MODEL` | — | Embeddings voor RAG (`nomic-embed-text`) |
| `LLM_TIMEOUT_MS` | `30000` | Time-out per LLM-call (verhoog op CPU: `180000`) |
| `LLM_KEEP_ALIVE` | `30m` | Houdt het model geladen tussen calls |
| `LLM_RETRY_MAX` / `LLM_RETRY_BASE_MS` / `LLM_RETRY_MAX_WAIT_MS` | `6` / `600` / `120000` | Stille auto-retry bij een hapering (nooit bij een time-out) |
| `AI_MAX_CONCURRENCY` | `2` | Max. gelijktijdige LLM-calls |
| `AI_REQUESTS_PER_MIN` | `30` | Minuutvenster (governor) |
| `AI_DAILY_TOKEN_BUDGET` | `3000000` | Dag-circuit-breaker |
| `AI_MAX_WAIT_MS` | `45000` | Hoe lang een call op een vrij slot wacht |
| `AI_BUDGET_HARD` | `true` | Hard blokkeren bij dagbudget (`false` = alleen loggen) |
| `AI_ALLOW_REMOTE` | `false` 🔴 | **Laat op false** — soevereiniteitsgrendel weigert niet-lokale hosts |

## Web Push (zelf-gehost VAPID)

| Variabele | Wat het doet |
|---|---|
| `WEBPUSH_VAPID_PUBLIC_KEY` / `WEBPUSH_VAPID_PRIVATE_KEY` | 🟡 Keypair voor push-meldingen — `npm run vapid:keys` of `gen-secrets` |
| `WEBPUSH_CONTACT` | `mailto:info@zekerflex.com` — VAPID-contact |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | ⚪ Optionele tweede push-provider (FCM) voor native apps |

## Uitgaande e-mail

| Variabele | Default | Wat het doet |
|---|---|---|
| `SMTP_HOST` | — | Leeg = **mailbox-only** (alles in `/admin/mail`). `postfix` met `--profile mail` = echte aflevering. `mailpit` met `--profile maildev` = dev-vangnet. Of een externe relay (`smtp.postmarkapp.com`, …) |
| `SMTP_PORT` | `1025` | `587` voor de Postfix-relay of een externe relay, `465` bij impliciete TLS |
| `SMTP_SECURE` | `false` | `true` voor impliciete TLS (poort 465) |
| `SMTP_USER` / `SMTP_PASS` | — | Alleen bij een relay met auth |
| `SMTP_TIMEOUT_S` | `20` | Time-out per SMTP-commando |
| `MAIL_FROM` | `noreply@zekerflex.com` | Afzender |
| `MAIL_FROM_NAME` | `ZekerFlex` | Weergavenaam |
| `MAIL_ADMIN` | `info@zekerflex.com` | Ontvanger van systeemmeldingen (vervanger gevraagd, testmail) |
| `MAIL_DOMAIN` | `zekerflex.com` | Toegestaan afzenderdomein voor de Postfix-relay (`--profile mail`) |
| `MAIL_HOSTNAME` | `mail.zekerflex.com` | HELO-hostnaam van de Postfix-relay |
| `RELAYHOST` | — | Leeg = Postfix levert direct af. Gezet (`smtp.provider.com:587`) = via smarthost |
| `RELAYHOST_USERNAME` / `RELAYHOST_PASSWORD` | — | Auth voor de smarthost |
| `DKIM_AUTOGENERATE` | `true` | Postfix genereert een DKIM-sleutel; publiceer die als TXT-record |

Bij accountregistratie stuurt de app **automatisch** een verificatiemail met een
6-cijferige code én een link. De template wordt per gebeurtenis gekozen
(`verification`, `welcome`, `replacement`, `test`). Zonder `SMTP_HOST` blijft de
code zichtbaar op `/verifieer-email` zodat lokaal niets vastloopt.

## Spraakherkenning (Whisper, optioneel maar aanbevolen)

| Variabele | Default | Wat het doet |
|---|---|---|
| `WHISPER_ENABLED` | `true` | Zet de lokale-spraak-fallback aan voor de Jarvis-microfoon |
| `WHISPER_BASE_URL` | `http://localhost:8000/v1` (prod: `http://whisper:8000/v1`) | OpenAI-compatibel `/audio/transcriptions` |
| `WHISPER_MODEL` | `Systran/faster-whisper-base` | Model in de whisper-container |
| `WHISPER_API_KEY` | — | Alleen als je Whisper-server auth vereist |

Starten: `npm run whisper` (lokaal) of `PROFILES="--profile voice"` (VPS).

## Beeldgeneratie (Studio, optioneel)

| Variabele | Default | Wat het doet |
|---|---|---|
| `IMAGE_ENABLED` | `false` | Zet de marketing-Studio aan |
| `IMAGE_BACKEND` | `a1111` | `a1111` (AUTOMATIC1111/Forge), `openai`, of `comfyui` |
| `IMAGE_BASE_URL` | `http://localhost:7860` (prod: `http://sd:7860`) | Stable Diffusion-server |
| `IMAGE_MODEL` / `IMAGE_STEPS` / `IMAGE_CFG` / `IMAGE_SAMPLER` | — / `28` / `5.5` / `DPM++ 2M Karras` | Render-instellingen |
| `IMAGE_COMFY_WORKFLOW` | — | Pad naar een ComfyUI API-workflow (alleen backend `comfyui`) |

## Nederlandse integraties

| Variabele | Wat het doet |
|---|---|
| `KVKBASE_API_URL` / `KVKBASE_API_KEY` | 🟡 Handelsregister-lookup + btw-validatie (VIES). Zonder sleutel: geen live KVK/btw-check |
| `DIDIT_BASE_URL` / `DIDIT_API_KEY` / `DIDIT_WEBHOOK_SECRET` / `DIDIT_WORKFLOW_ID` / `DIDIT_CALLBACK_URL` | ⚪ KYC met document + liveness. Zonder: de self-serve AI-ID-check blijft werken |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ⚪ Google-login. Redirect-URI: `…/api/auth/callback/google` |
| `GOOGLE_MAPS_API_KEY` | ⚪ Nauwkeurige reistijden (anders schatting op basis van afstand) |
| `OPENOV_BASE_URL` | `https://api.openov.nl` — OV-reisinfo |

## SEPA-uitbetalingen

| Variabele | Wat het doet |
|---|---|
| `SEPA_API_BASE_URL` / `SEPA_API_KEY` | ⚪ PSD2/betaalprovider. Zonder: uitbetalingen worden gesimuleerd |
| `SEPA_CREDITOR_IBAN` / `SEPA_CREDITOR_NAME` | Debiteur-gegevens op de SEPA-opdracht |

## Bedrijfslogica (tunables)

| Variabele | Default | Wat het doet |
|---|---|---|
| `PLATFORM_FEE_RATE` | `0.08` | Platformfee voor bedrijven (8%) |
| `VAT_RATE_STANDARD` | `0.21` | Standaard btw-tarief |
| `MATCHING_MIN_SCORE` | `0.55` | Drempel om te matchen |
| `MATCHING_MAX_TRAVEL_MINUTES` | `75` | Max. reistijd in de score |
| `MATCHING_WEIGHT_RELIABILITY` / `_TRAVEL` / `_SKILL` | `0.4` / `0.35` / `0.25` | Gewichten in de matchscore |
| `DBA_MAX_HOURS_PER_CLIENT` / `DBA_WARN_HOURS_PER_CLIENT` | `1200` / `900` | Wet DBA-drempels (uren bij één opdrachtgever) |
| `DBA_MAX_CONSECUTIVE_WEEKS` | `26` | Wet DBA — opeenvolgende weken |
| `DBA_MAX_CLIENT_REVENUE_SHARE` | `0.7` | Wet DBA — omzetaandeel bij één klant |
| `UPLOADS_DIR` | `./storage/uploads` | Lokale opslag voor uploads (mount een volume) |
| `UPLOAD_MAX_BYTES` | `25000000` | Max. uploadgrootte |
| `RAG_ENABLED` / `RAG_EMBED_DIM` / `RAG_MAX_CHUNKS` | `true` / `768` / `8000` | Lokaal totaalgeheugen |
| `VOICE_ENABLED` | `true` | Spraakmeldingen aan/uit |
| `PIPER_BIN` / `PIPER_MODEL` | — | ⚪ Server-side neurale TTS (anders browserstem) |
| `JARVIS_BOOT_BRIEFING` | `false` | Spreek een statusbriefing uit bij de eerste activiteit na boot |

---

## Filesystem-opslag (geen database)

Deze features slaan **buiten de database** op, in `storage/` (mount als volume):

| Map | Inhoud |
|---|---|
| `storage/uploads/` | Geüploade bestanden (ID-documenten, Jarvis-bijlagen) |
| `storage/mail/` | Lokale mailbox + verificatietokens |
| `storage/prefs/` | Per-gebruiker: beschikbaarheid, richttarief, job-alerts, dienst-bevestigingen |
| `storage/fiscal/` | Per-flexwerker: werkvorm, btw-nummer, verloningsvorm (BSN alleen gehasht) |
| `storage/replacements/` | Vervanger-verzoeken |
| `storage/marketing/` → `public/marketing/` | Marketingfoto's |

Back-up van `storage/` + een `pg_dump` = volledige back-up. Zie
`deploy/scripts/backup.sh`.
