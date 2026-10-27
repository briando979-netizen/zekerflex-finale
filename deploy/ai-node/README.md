# ZekerFlex AI-node (eigen taalmodel voor de live site)

De live site draait op Vercel; daar is geen taalmodel. Deze node is één eigen
server die het model bedient voor Jarvis, de sales-motor en de chatassistent.
Alle data blijft op jouw server.

## Wat heb je nodig

- Een server met **Ubuntu 22.04 of 24.04**:
  - **Met GPU** (aanbevolen): het script leest het videogeheugen uit en kiest zelf het sterkste model dat past:

    | Videogeheugen | Hoofdmodel | Kwaliteit |
    |---|---|---|
    | 420 GB+ (bv. 8× H100/H200 80GB) | `deepseek-r1:671b` | Zeer groot open model; multi-GPU server vereist |
    | 240 GB+ (bv. 4× H100 80GB of 8× A100 40GB) | `llama3.1:405b` | Zeer groot open model; multi-GPU server vereist |
    | 48 GB+ (bv. RTX 6000 Ada / A6000 / L40S) | `qwen2.5:72b` | beste dat op één kaart past; dicht bij de grote commerciële modellen |
    | 24 GB+ (bv. RTX 4090 / A5000 / L4×2) | `qwen2.5:32b` | erg goed, aanrader voor prijs/kwaliteit |
    | 16–20 GB (bv. RTX 4000 Ada / A4000) | `qwen2.5:14b` | goed |
    | minder | `qwen2.5:7b` | basis |

    Meer videogeheugen = groter/slimmer model = betere antwoorden van Jarvis, de AI-teams en de specialisten. De console (**Admin → Jarvis**, brein-badge) toont welke modellen de node serveert en laat je er direct een kiezen — token-vrij, zonder redeploy.

  - **Alleen CPU**: het installatiescript leest RAM en CPU-threads uit en kiest een klein profiel. Het begrenst tegelijk Ollama op één aanvraag per model en een context van 4096 tokens om piekgeheugen te beperken. Zie de CPU-tabel hieronder.
- Een subdomein, bv. `ai.zekerflex.com`, met een **A-record** naar het IP-adres van de server.

## CPU-only: nuttige profielen voor een VPS

Het script kiest automatisch op basis van het beschikbare RAM en aantal CPU-threads. De modelgroottes hieronder zijn de Q4-downloads uit de Ollama-library; Ollama heeft daarnaast RAM nodig voor het besturingssysteem, context en modelruntime.

| Servercapaciteit | Hoofdmodel | Snel model | Geschikt voor |
|---|---|---|---|
| Minder dan 16 GB of minder dan 4 threads | `qwen2.5:0.5b` | `qwen2.5:0.5b` | Korte classificatie en eenvoudige herschrijvingen |
| Vanaf 16 GB én 4 threads | `qwen2.5:1.5b` | `qwen2.5:0.5b` | Korte antwoorden, samenvatten en lichte schrijftaken |
| Vanaf 32 GB én 8 threads | `qwen2.5:7b` | `qwen2.5:1.5b` | Bruikbaardere drafts, samenvattingen en JSON-uitvoer |
| Vanaf 64 GB én 16 threads | `qwen2.5:14b` | `qwen2.5:1.5b` | Betere kwaliteit voor complexere taken, met meer wachttijd |

De Q4-gewichten nemen ongeveer 398 MB (0.5B), 986 MB (1.5B), 4.7 GB (7B) en 9 GB (14B) in. De CPU-profielen gebruiken één gelijktijdige aanvraag en maximaal twee geladen modellen. Dat voorkomt dat meerdere lange contexten tegelijk het beperkte RAM opsouperen; extra aanvragen wachten in de Ollama-queue.

De automatische profielen kiezen Qwen2.5-tags die als Apache 2.0 zijn gepubliceerd. De 3B-tag heeft een aparte Qwen-licentie en wordt daarom niet automatisch gekozen; controleer de licentie van een model voordat je een andere tag commercieel inzet.

## Installeren

```bash
scp deploy/ai-node/setup.sh root@<server-ip>:/root/
ssh root@<server-ip>
sudo bash setup.sh ai.zekerflex.com
```

Andere modellen: `MODEL=qwen2.5:7b FAST_MODEL=qwen2.5:1.5b sudo -E bash setup.sh ai.zekerflex.com`

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
