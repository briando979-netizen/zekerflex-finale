# Badges en labels: de printagent op locatie

ZekerFlex zet elke badge, naamsticker, verzendlabel of incheckbon in een
wachtrij (Werkgever → Op locatie → Badges en labels). Printen kan op drie
manieren; kies wat bij de printer past.

| Manier | Wanneer | Nodig |
|---|---|---|
| **Afdrukpagina** in de browser | Brother QL, Dymo, Zebra met driver; een computer bij de printer | niets extra's: klik "Afdrukpagina", Ctrl+P, kies de labelprinter |
| **Bluetooth** vanaf een telefoon | goedkope 58/80 mm bonprinters en labelprinters met Bluetooth | Chrome of Edge op Android/Windows/Mac/Linux (niet iPhone) |
| **Printagent** (dit programma) | de printer moet vanzelf printen, ook als er niemand kijkt (badge bij inchecken) | een computer of Raspberry Pi bij de printer, Python 3 |

## De printagent installeren

```bash
sudo apt install -y python3 cups          # Linux; op Mac zit CUPS er al in, op Windows is Python genoeg
lpstat -p                                   # de naam van je printer
cd deploy/printen
cp .env.example .env                        # vul PRINT_TOKEN en PRINTER in
set -a; . ./.env; set +a
python3 print_agent.py
```

Het token maak je onder Werkgever → Op locatie → Badges en labels → "Token voor
de agent"; je ziet het één keer. Zodra de agent draait staat hij daar als "online".

Als dienst:

```bash
sudo cp zekerflex-printagent.service /etc/systemd/system/
sudo systemctl enable --now zekerflex-printagent
```

## Twee printwijzen

- **`WIJZE=escpos`** (standaard): ZekerFlex levert per label de ruwe ESC/POS-bytes
  (de taal van bon- en de meeste labelprinters). De agent stuurt die ongewijzigd
  door: `lp -o raw`, naar een netwerkprinter op poort 9100 (`PRINTER=192.168.1.40:9100`)
  of op Windows via `copy /b` naar de gedeelde printer. Werkt zonder driver.
- **`WIJZE=pagina`**: voor labelprinters die geen ESC/POS spreken (Brother QL
  via de driver, Dymo). De agent opent de afdrukpagina van het label in Chromium,
  maakt er een PDF van op precies het labelformaat en print die via CUPS. De
  afdrukpagina staat achter de ZekerFlex-login; geef de agent daarom een
  Chromium-profielmap waarin een beheerder is ingelogd (`CHROME_PROFIEL=/home/pi/.config/zf-chrome`,
  één keer `chromium --user-data-dir=... https://zekerflex.com/login` doen).

## Instellingen

| Variabele | Betekenis |
|---|---|
| `ZEKERFLEX_URL` | `https://zekerflex.com` |
| `PRINT_TOKEN` | het token van de agent |
| `PRINTER` | printernaam uit `lpstat -p`, of `host:9100`; leeg = standaardprinter |
| `ROL` | `58` of `80` mm (ESC/POS) |
| `WIJZE` | `escpos` of `pagina` |
| `INTERVAL` | seconden tussen twee keer ophalen, standaard 3 |

## Welke printer?

- **Brother QL-820NWB** (62 mm, wifi + Bluetooth): afdrukpagina of agent met
  `WIJZE=pagina`; Bluetooth vanaf een telefoon werkt ook.
- **Goedkope 58 mm Bluetooth-bonprinter** (€ 20–40): Bluetooth vanaf een
  telefoon, of de agent met `WIJZE=escpos` via usb.
- **Zebra ZD220/ZD420** (verzendlabels 100 × 150 mm): afdrukpagina of agent met
  `WIJZE=pagina` en een rol van 100 mm.
