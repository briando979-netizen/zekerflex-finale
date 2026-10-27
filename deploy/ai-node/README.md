# ZekerFlex AI-node (eigen taalmodel voor de live site)

De live site draait op Vercel; daar is geen taalmodel. Deze node is één eigen
server die het model bedient voor Jarvis, de sales-motor en de chatassistent.
Alle data blijft op jouw server.

## Wat heb je nodig

- Een server met **Ubuntu 22.04 of 24.04**:
  - **Met GPU** (aanbevolen): het script leest het videogeheugen uit en kiest zelf het sterkste model dat past:

    | Videogeheugen | Hoofdmodel | Kwaliteit |
    |---|---|---|
    | 420 GB+ (bv. 8× H100/H200 80GB) | `deepseek-r1:671b` of `deepseek-v3` (671B) | **frontier: in omvang groter dan Claude**, evenaart de beste commerciële modellen |
    | 240 GB+ (bv. 4× H100 80GB of 8× A100 40GB) | `llama3.1:405b` (405B) | **frontier-klasse, groter dan Claude** |
    | 48 GB+ (bv. RTX 6000 Ada / A6000 / L40S) | `qwen2.5:72b` | beste dat op één kaart past; dicht bij de grote commerciële modellen |
    | 24 GB+ (bv. RTX 4090 / A5000 / L4×2) | `qwen2.5:32b` | erg goed, aanrader voor prijs/kwaliteit |
    | 16–20 GB (bv. RTX 4000 Ada / A4000) | `qwen2.5:14b` | goed |
    | minder | `qwen2.5:7b` | basis |

    Meer videogeheugen = groter/slimmer model = betere antwoorden van Jarvis, de AI-teams en de specialisten. De console (**Admin → Jarvis**, brein-badge) toont welke modellen de node serveert en laat je er direct een kiezen — token-vrij, zonder redeploy.

    **Groter dan Claude, zonder dure GPU's?** De 671B-modellen (`deepseek-v3` / `deepseek-r1:671b`) zijn Mixture-of-Experts: ze activeren maar ~37B parameters per token, dus ze draaien óók op een server met veel **systeem-RAM** (~512 GB) op CPU. Dat is traag (reken op tientallen seconden per antwoord) maar volledig token-vrij en privé. Zet dan zelf het model: `MODEL=deepseek-v3 sudo -E bash setup.sh ai.zekerflex.com`.
  - **Alleen CPU** (goedkoper, trager): minimaal 8 vCPU / 32 GB RAM. Reken op 10–40 s per antwoord met `qwen2.5:7b`; kies dan liever `MODEL=qwen2.5:3b`.
- Een subdomein, bv. `ai.zekerflex.com`, met een **A-record** naar het IP-adres van de server.

## Wereldklasse brein — wat moet je kopen?

Eerst eerlijk: **laptops en opslag zijn niet de bottleneck.** Wat telt is **geheugen waar het model in past** — GPU-VRAM (snel) of unified/systeem-RAM (goedkoper, trager). Eén losse laptop (max ~128 GB) draait tot ~70–100B; een frontier-model van 400B–2,8T past daar niet in. De echte opties, van haalbaar naar datacenter:

1. **Eén stille machine die een 671B-model draait — de slimste "thuis"-optie.**
   **Apple Mac Studio, M3 Ultra, 512 GB unified memory** (± €10.000–11.000). Draait **DeepSeek-R1/V3 671B** (4-bit, ~404 GB) volledig in geheugen op ~17–18 tokens/sec bij <200 W — aangetoond in reviews. Installeer Ollama (de **Mac-app**, niet dit Ubuntu-script) en `ollama pull deepseek-r1:671b`. ⚠️ De 512 GB-optie zou door een DRAM-tekort tijdelijk uit Apple's configurator zijn — check Apple, of neem 256 GB (draait 405B) of tweedehands 512 GB.

2. **Snelste, datacenter-klasse.** Een GPU-server met **8× NVIDIA H100/H200 (80–141 GB)** = ~0,6–1,1 TB VRAM (± €200.000+ nieuw, of per uur huren). Draait 405B/671B vlot en meerdere modellen tegelijk; hier mikken de 240/420 GB-tiers van `setup.sh` op.

3. **Budget, token-vrij, traag.** Een server met **512 GB–1,5 TB systeem-RAM** (dual-socket EPYC/Xeon, ± €4.000–8.000). MoE-modellen activeren maar ~37B params per token, dus die draaien op CPU — enkele tokens/sec, maar €0 per vraag.

4. **Het állergrootste open model ("werelds grootste").** Vendors claimen nu **Kimi K3 (~2,8 biljoen params)**, **DeepSeek V4 (~1,6T)** en **Kimi K2.6 (~1T)** als grootste open-weights. Die passen niet op één machine: je hebt een **cluster** nodig (bijv. 2–4× Mac Studio 512 GB gekoppeld via EXO/MLX, of meerdere 8×H200-nodes; ~1,6 TB+ geheugen totaal) — een serverrack en €-tonnen, of uurhuur. ⚠️ Deze cijfers komen van vendor-blogs van ná mijn kennisdatum — **controleer parameters, licentie en de exacte Ollama/Hugging-Face-tag op de officiële model-card** vóór aanschaf.

**Advies als je nú één ding koopt:** de **Mac Studio M3 Ultra 512 GB** — draait een echt frontier-model (671B) lokaal, stil, zuinig, volledig token-vrij, en is verreweg de goedkoopste weg naar "groter dan Claude op je eigen bureau". De console (Admin → Jarvis) ziet het model zodra je het pullt; kiezen gaat met één klik.

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
