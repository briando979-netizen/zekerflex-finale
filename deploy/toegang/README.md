# Toegang op kenteken: het kastje bij de slagboom

Een klein kastje op het terrein (Raspberry Pi 4 of een mini-pc) leest met een
gewone IP-camera het kenteken van een auto die aanrijdt, vraagt ZekerFlex of
die auto nu het terrein op mag (het rooster beslist) en zet dan de slagboom
open. Alles erop is vrije software; ZekerFlex rekent geen licentie.

## Wat je nodig hebt

- Een **Raspberry Pi 4 (4 GB)** of een mini-pc met Linux (Debian/Ubuntu).
- Een **IP-camera met RTSP** (bijvoorbeeld Reolink, Hikvision, Dahua), gericht op
  de inrit op 3–8 meter afstand, met het kenteken goed in beeld.
- Een **relais** om de slagboom aan te sturen: een relaisbord op de GPIO-pinnen
  van de Pi, een usb-relais (`usbrelay`) of een netwerkrelais (Shelly, Tasmota).
  De installateur van de slagboom weet welk contact "open" geeft.
- Internet op het terrein (bekabeld, wifi of 4G).
- Het **token** van de vestiging: Werkgever → Op locatie → Toegang → "Token voor
  het kastje". Je ziet het één keer.

## Installeren

```bash
sudo apt install -y python3-pip python3-venv libgl1
git clone https://github.com/briando979-netizen/zekerflex-finale.git   # of kopieer alleen deze map
cd zekerflex-finale/deploy/toegang
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # vul ZEKERFLEX_URL, TOEGANG_TOKEN, CAMERA_URL en RELAIS in
set -a; . ./.env; set +a
python3 toegang_agent.py
```

Als dienst (start vanzelf na stroomuitval):

```bash
sudo cp zekerflex-toegang.service /etc/systemd/system/
sudo systemctl enable --now zekerflex-toegang
journalctl -u zekerflex-toegang -f
```

Of met Docker (op een mini-pc met een usb-camera of RTSP):

```bash
docker compose up -d --build
```

## Eerst proberen zonder camera

```bash
PROEF=1 python3 toegang_agent.py
```

Je typt dan kentekens in; het kastje vraagt het echt aan ZekerFlex en schakelt het
relais. In ZekerFlex zie je de aankomst in het logboek (Werkgever → Op locatie →
Toegang) en staat het kastje op "online". Daar kun je ook "Proef met een
kenteken" doen zonder kastje.

## Hoe het besluit valt

1. Het kastje stuurt het kenteken naar `POST /api/toegang/kenteken` met het token.
2. ZekerFlex zoekt het kenteken: eerst in de lijst van het bedrijf (eigen
   medewerkers, bezoekers, leveranciers), dan bij flexwerkers die hun kenteken in
   de app invulden (Account → Mijn kenteken).
3. Een **flexwerker** mag erin als hij op dat moment (90 minuten vooraf tot 60
   minuten na) op die vestiging ingepland staat. Een **eigen medewerker** altijd.
   Een **bezoeker of leverancier** alleen binnen het ingestelde tijdvenster.
4. Het antwoord zegt `open: true/false` en hoeveel seconden. Het kastje schakelt
   het relais; ZekerFlex logt de aankomst en stuurt de planner (en de werker)
   een melding.
5. Elke 2 seconden haalt het kastje `GET /api/toegang/opdrachten` op: drukt een
   beheerder in ZekerFlex op "Open slagboom", dan gaat de slagboom ook open.

De slagboom gaat **nooit** open zonder antwoord van ZekerFlex: valt het internet
weg, dan blijft hij dicht (de portier kan altijd handmatig openen).

## Instellingen

| Variabele | Betekenis |
|---|---|
| `ZEKERFLEX_URL` | `https://zekerflex.com` |
| `TOEGANG_TOKEN` | het token van deze vestiging |
| `CAMERA_URL` | `rtsp://gebruiker:wachtwoord@192.168.1.20:554/stream1`, of `0` voor een usb-camera |
| `CAMERA_NAAM` | hoe de camera in het logboek heet, bijv. `Inrit noord` |
| `RELAIS` | `gpio:17`, `usbrelay:1`, `http://192.168.1.30/relay/0?turn=on` of `geen` |
| `HERKENNING_DREMPEL` | zekerheid van de herkenning, standaard `0.8` |
| `HERHAAL_SECONDEN` | hetzelfde kenteken niet vaker melden dan eens per zoveel seconden, standaard `20` |
| `APPARAAT` | de naam van het kastje in ZekerFlex (standaard de hostnaam) |

## Privacy

Het kastje stuurt alleen het herkende kenteken (letters en cijfers), nooit
beelden. ZekerFlex bewaart per aankomst het kenteken, het besluit en de tijd in
het logboek van het bedrijf (laatste 3000). Een flexwerker kan zijn kenteken
altijd weer weghalen in de app; dan herkent de slagboom hem niet meer.
