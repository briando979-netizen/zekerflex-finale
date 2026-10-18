# ZekerFlex AI-node (eigen taalmodel voor de live site)

De live site draait op Vercel; daar is geen taalmodel. Deze node is één eigen
server die het model bedient voor Jarvis, de sales-motor en de chatassistent.
Alle data blijft op jouw server.

## Wat heb je nodig

- Een server met **Ubuntu 22.04 of 24.04**:
  - **Met GPU** (aanbevolen): het script leest het videogeheugen uit en kiest zelf het sterkste model dat past:

    | Videogeheugen | Hoofdmodel | Kwaliteit |
    |---|---|---|
    | 48 GB+ (bv. RTX 6000 Ada / A6000 / L40S) | `qwen2.5:72b` | beste: komt het dichtst bij de grote commerciële modellen |
    | 24 GB+ (bv. RTX 4090 / A5000 / L4×2) | `qwen2.5:32b` | erg goed, aanrader voor prijs/kwaliteit |
    | 16–20 GB (bv. RTX 4000 Ada / A4000) | `qwen2.5:14b` | goed |
    | minder | `qwen2.5:7b` | basis |

    Meer videogeheugen = slimmer model = betere antwoorden van Jarvis, de AI-teams en de specialisten.
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
| `LLM_MODEL` | wat het script toont (bv. `qwen2.5:32b`) |
| `LLM_FAST_MODEL` | wat het script toont |
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

## Beeldstudio en advertenties (optioneel, GPU nodig)

De Studio (admin → Studio) maakt beelden via een eigen Stable Diffusion-server. Draai op dezelfde GPU-server bijvoorbeeld **ComfyUI** of **AUTOMATIC1111** achter Caddy (zelfde sleutelcontrole als hierboven, op een eigen subdomein zoals `beeld.zekerflex.com`) en zet in Vercel:

| Variabele | Waarde |
|---|---|
| `IMAGE_ENABLED` | `true` |
| `IMAGE_BACKEND` | `comfyui` of `a1111` |
| `IMAGE_BASE_URL` | `https://beeld.zekerflex.com` |
| `IMAGE_API_KEY` | de sleutel |

De advertentiegenerator werkt ook zonder model: dan kiest hij uit vaste, gecontroleerde teksten. Met het taalmodel schrijft hij nieuwe varianten (alleen met feiten uit de vaste feitenlijst).
