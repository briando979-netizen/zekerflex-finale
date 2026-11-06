# Eigen stem (Piper): tekst naar spraak zonder Google

ZekerFlex laat teksten voorlezen: de AI-console, de AI-beller en de stem onder
een video. Dat liep tot nu toe via **Google Text-to-Speech**, dat per teken
afrekent. Deze map zet er een eigen stem naast: **Piper**, een klein
spraakmodel dat op onze eigen VPS draait.

- Kost **niets** per keer en heeft **geen sleutel** nodig.
- De tekst verlaat onze server niet.
- Draait op de CPU (geen videokaart nodig), ±1 GB image, ±150 MB geheugen.
- Nederlandse stem; een halve seconde rekentijd per zin.

De app kiest zelf (`lib/ai/neural-tts.ts`):

| Situatie | Welke stem |
| --- | --- |
| "Alles gratis" staat aan (Admin → ZekerFlex AI) | eerst Piper, Google alleen als Piper niet antwoordt |
| Geen Google-sleutel | alleen Piper |
| Google-sleutel én "alles gratis" uit | eerst Google, Piper als Google faalt (tegoed op, sleutel mag geen TTS) |
| Allebei niet beschikbaar | zoals vroeger: de browserstem, of geen geluid |

Zolang `PIPER_URL` niet in `.env.production` staat, verandert er niets: dan
blijft alles precies zoals het was.

## Aanzetten op de VPS (vier stappen)

Alles vanuit de projectmap, `cd ~/zekerflex`.

**1. De Nederlandse stem binnenhalen** (±60 MB, eenmalig):

```sh
bash deploy/piper/haal-stem.sh
```

Dat zet `nl_BE-nathalie-medium.onnx` (+ `.onnx.json`) in
`deploy/piper/stemmen/`. Een andere stem? Zet het stem-id erachter, bijvoorbeeld
`bash deploy/piper/haal-stem.sh nl_NL-mls_5809-low` — bovenaan dat script staat
de lijst — en zet de bestandsnaam in `deploy/piper/config/voice_to_speaker.yaml`.

**2. De dienst starten.** `docker-compose.vps.yml` blijft onaangeraakt; dit
fragment gaat er als tweede bestand naast:

```sh
sudo docker compose -f docker-compose.vps.yml -f deploy/piper/docker-compose.piper.yml \
  --env-file .env.production --profile piper up -d piper
```

Controleren of hij staat: `sudo docker compose -f docker-compose.vps.yml -f deploy/piper/docker-compose.piper.yml ps piper`
en bij twijfel het log: `… logs --tail 50 piper`.

**3. Testen vanaf de VPS zelf** (het fragment zet poort 5000 alleen op
loopback, dus niet open naar internet):

```sh
curl -s http://127.0.0.1:5000/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -d '{"model":"tts-1","voice":"alloy","input":"Goedemiddag, u spreekt met ZekerFlex.","response_format":"mp3"}' \
  -o /tmp/stem.mp3 && ls -l /tmp/stem.mp3
```

Een bestand van tientallen kilobytes = goed. Haal hem naar je pc om te horen
of het Nederlands klinkt: `scp briando@37.97.226.24:/tmp/stem.mp3 .`

**4. De app erop wijzen.** In `.env.production`:

```
PIPER_URL=http://piper:8000
```

en de app herstarten:

```sh
sudo docker compose -f docker-compose.vps.yml --env-file .env.production up -d app
```

Klaar. Wil je dat ook de AI-console en de video-stem meteen de eigen stem
pakken terwijl de Google-sleutel er nog staat, zet dan **Admin → ZekerFlex AI →
alles gratis** aan.

> `http://piper:8000` is het adres op het interne Docker-netwerk: `piper` is de
> naam van de dienst en 8000 de poort waarop deze image luistert. De 5000 uit
> stap 3 is alleen de testpoort op de VPS zelf.

## Later vast in docker-compose.vps.yml

Zolang het fragment als tweede `-f` meegaat, hoeft dat niet. Wil je het later
toch vast opnemen (dan start het mee met één commando), plak dan het
`piper:`-blok uit `docker-compose.piper.yml` onder `services:` in
`docker-compose.vps.yml`, net na `planner:`. Er is geen volume en geen geheim
nodig, dus er hoeft onderaan niets bij. Doe dat niet tijdens een uitrol van
iemand anders — meerdere sessies werken in hetzelfde bestand.

## Waarom deze image

`ghcr.io/matatonic/openedai-speech-min` — Piper eronder, met een
OpenAI-compatibele HTTP-koppeling (`POST /v1/audio/speech`). Drie redenen:

1. **Gewoon HTTP, dezelfde vorm als Ollama.** Eén patroon voor al onze eigen
   AI-diensten, en `lib/ai/piper.ts` probeert die vorm als eerste.
2. **Hij geeft MP3 terug** (ffmpeg zit erin). Alle plekken die de stem nu
   gebruiken verwachten MP3; met alleen WAV zou de video-editor de lengte van
   het geluid verkeerd schatten.
3. **De `-min`-variant is de kleine**: alleen Piper, geen torch/XTTS (±1 GB in
   plaats van ±5 GB). Op een CPU-only VPS is dat de enige zinnige keuze.

`rhasspy/wyoming-piper` is bewust niet gekozen: die praat het Wyoming-protocol
over een eigen TCP-poort in plaats van HTTP, dus daar zou nog een brug tussen
moeten staan.

`lib/ai/piper.ts` kan ook met de eenvoudige HTTP-server van Piper zelf praten
(`POST /` met de tekst in de body, antwoord in WAV). Zet je er later een andere
stem-server onder, dan hoeft de code dus niet mee: alleen `PIPER_URL` wijzigen.

## Als het niet werkt

| Wat je ziet | Wat het is |
| --- | --- |
| De stem leest Nederlands met een Engels accent | `voice_to_speaker.yaml` wordt niet gelezen of wijst naar een Engelse stem. Controleer dat `deploy/piper/config` gemount is en dat de bestandsnaam onder `alloy:` bestaat in `deploy/piper/stemmen/`. |
| `curl` geeft 404 | De dienst luistert, maar niet op dit pad: kijk in het log welk pad hij noemt. `PIPER_URL` mag ook een volledig pad zijn (`…/v1/audio/speech`); de code houdt dat heel. |
| Geen geluid in de app, wel met `curl` | `PIPER_URL` staat niet in `.env.production`, of de app is niet herstart. In Admin → Systeem → Foutmeldingen staat dan ook niets over piper. |
| In het log "piper onbereikbaar" | De dienst staat uit of hangt niet op hetzelfde netwerk (`internal`). Start hem met het profiel `piper`. |
| Eerste keer traag | Het model wordt bij het eerste verzoek ingelezen. Daarna is het snel. |

Het log noemt nooit een volledig adres of een sleutel, alleen de host — zo komt
er niets gevoeligs in het foutenlogboek.
