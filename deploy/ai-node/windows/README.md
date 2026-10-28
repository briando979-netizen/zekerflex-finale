# AI-node op je eigen Windows-laptop

Je laptop wordt het taalmodel voor de live site. Hij gebruikt Ollama, een
beveiligingslaag en een Cloudflare-tunnel; je hebt geen eigen domein en geen
Cloudflare-account nodig.

## Starten

PowerShell, vanuit de projectmap:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\ai-node\windows\start-ai-node.ps1 -Install -NoSleep
```

- `-Install` laat de AI-node voortaan vanzelf starten als je inlogt op Windows.
- `-NoSleep` voorkomt dat de laptop aan de lader in slaap valt.

**De eerste keer** maakt het script een geheime sleutel aan. Daarnaast toont het script de waarden die je in Vercel moet zetten.

1. Plak die regels in Vercel → Project → Settings → Environment Variables (Production). `LLM_BASE_URL` blijft zoals het is.
2. Klik daarna op **Redeploy**.
3. Binnen een minuut meldt de laptop zich aan. In Admin → Systeem → "Test taalmodel" zie je het antwoord.

## Hoe het werkt

```
live site (Vercel) ──https──► Cloudflare-tunnel ──► auth-proxy.mjs (127.0.0.1:11500) ──► Ollama (127.0.0.1:11434)
        ▲                                               alleen met sleutel; alleen
        └── laptop meldt elke minuut het tunneladres     chat / embeddings / models
            (POST /api/internal/ai-node/register)
```

- Het tunneladres verandert bij elke start. De laptop geeft het nieuwe adres zelf door, dus je hoeft niets opnieuw in Vercel te zetten.
- De site controleert eerst of het adres met de juiste sleutel antwoordt, en neemt het pas daarna in gebruik.
- Mist de site drie aanmeldingen op rij (laptop uit, slaapstand, geen internet), dan schakelen alle AI-functies terug naar hun regels. Niets gaat stuk.
- Ollama zelf staat nooit open naar internet. Modellen downloaden of verwijderen kan niet via de tunnel.

## Snelheid

De laptop heeft geen videokaart en 8 GB geheugen, dus het script gebruikt compacte modellen:
- `qwen3:4b` voor hoofdvragen, redeneren en vertalen;
- `qwen3:1.7b` voor snelle taken;
- `qwen2.5-coder:3b` voor code-agents;
- `nomic-embed-text` voor kennisbank-vectoren.

Het script downloadt en registreert de modellen voor elke rol. Je kunt een rolmodel overslaan door de betreffende parameter leeg mee te geven; die rol valt dan terug op het hoofdmodel.

Reken op een paar seconden tot een halve minuut per antwoord.

## Tunnel verbindt niet? (QUIC/UDP geblokkeerd)

Zie je in `%USERPROFILE%\.zekerflex-ai\tunnel.log` fouten als *"failed to run the datagram handler"* of *"control stream encountered a failure"*, en blijft de node op `node:null`? Dan blokkeert je netwerk/ISP de standaard QUIC-verbinding (UDP 7844). Het script dwingt daarom `--protocol http2` af (TCP 443), wat door vrijwel elke firewall komt. Draait er nog een oude instantie met QUIC, stop dan eerst alles (`Get-Process cloudflared,ollama | Stop-Process -Force` + de `node.exe` met `auth-proxy`) en start opnieuw.

## Later naar een vaste server

Draai `deploy/ai-node/setup.sh` op een Ubuntu-server en zet `LLM_BASE_URL` in Vercel. Zodra `LLM_BASE_URL` geen localhost meer is, negeert de site de laptop. Daarna kun je `start-ai-node.ps1 -Uninstall` draaien.
