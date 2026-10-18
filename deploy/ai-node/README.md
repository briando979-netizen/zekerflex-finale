# ZekerFlex AI-node (eigen taalmodel voor de live site)

De live site draait op Vercel; daar is geen taalmodel. Deze node is één eigen
server die het model bedient voor Jarvis, de sales-motor en de chatassistent.
Alle data blijft op jouw server.

## Wat heb je nodig

- Een server met **Ubuntu 22.04 of 24.04**:
  - **Met GPU** (aanbevolen, snel): bv. een GPU-server met een RTX 4000/A4000 (16–20 GB VRAM). `qwen2.5:7b` antwoordt dan binnen een paar seconden.
  - **Alleen CPU** (goedkoper, trager): minimaal 8 vCPU / 32 GB RAM. Reken op 10–40 s per antwoord met `qwen2.5:7b`; kies dan liever `MODEL=qwen2.5:3b`.
- Een subdomein, bv. `ai.zekerflex.com`, met een **A-record** naar het IP-adres van de server.

## Installeren

```bash
scp deploy/ai-node/setup.sh root@<server-ip>:/root/
ssh root@<server-ip>
sudo bash setup.sh ai.zekerflex.com
```

Andere modellen: `MODEL=qwen2.5:14b FAST_MODEL=llama3.2:3b sudo -E bash setup.sh ai.zekerflex.com`

Het script eindigt met de waarden voor Vercel. Zet ze bij **Settings → Environment Variables (Production)** en deploy opnieuw:

| Variabele | Waarde |
|---|---|
| `LLM_BASE_URL` | `https://ai.zekerflex.com/v1` |
| `LLM_API_KEY` | de sleutel uit het script |
| `AI_ALLOW_REMOTE` | `true` |
| `LLM_MODEL` | `qwen2.5:7b` |
| `LLM_FAST_MODEL` | `llama3.2:3b` |
| `LLM_EMBED_MODEL` | `nomic-embed-text` |
| `LLM_TIMEOUT_MS` | `60000` |

Controleren: in de admin bij **Systeemstatus** staat het taalmodel op groen, en Jarvis antwoordt.

## Beveiliging

- Ollama luistert alleen op `127.0.0.1`; van buiten is alleen Caddy bereikbaar.
- Elke aanvraag moet `Authorization: Bearer <sleutel>` meesturen, anders `401`.
- HTTPS met een automatisch vernieuwd Let's Encrypt-certificaat.
- Firewall: alleen SSH, 80 (certificaat) en 443.
- **Sleutel vervangen:** `sudo bash setup.sh ai.zekerflex.com --rotate-key`, daarna `LLM_API_KEY` in Vercel bijwerken en opnieuw deployen.

## Onderhoud

- Logs: `journalctl -u ollama -f` en `/var/log/caddy/zekerflex-ai.log`
- Modellen bijwerken: `ollama pull qwen2.5:7b`
- Zonder bereikbaar model blijft de site werken: sales valt terug op templates en een eigen score, en Jarvis meldt duidelijk dat het model ontbreekt.
