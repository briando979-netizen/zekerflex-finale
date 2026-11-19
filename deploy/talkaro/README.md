# Talkaroo

Een site waar je willekeurig aan één vreemde wordt gekoppeld voor een gesprek met tekst of video, met zes spelletjes.
Geen account, geen cookies, geen diensten van buiten: alles komt van de site zelf.

Talkaroo is een eigen, losstaand product. Het gekozen adres is **talkaro.zekerflex.com** (met één o aan het eind).
De naam staat op één plek: zet `SITE_NAAM=Talkaro` en de hele site, het woordmerk en de teksten heten zo.

> **Er is niets uitgerold.** Er bestaat geen DNS-regel, geen container op een server en geen certificaat.
> Alles hieronder onder "Live gaan" is voorbereiding.

## Lokaal starten

```
npm install
npm start
```

Open http://localhost:3000 in twee vensters om met jezelf te praten. Video werkt zo ook (twee vensters op dezelfde computer).

Wil je het vanaf je telefoon in je eigen netwerk proberen: camera en microfoon werken in een browser alleen via https.
Zet een eigen certificaat als `certs/cert.pem` en `certs/key.pem` neer en start opnieuw; de server gebruikt dan https.

De beheerpagina staat standaard uit. Aanzetten voor een proef (PowerShell):

```
$env:BEHEER_TOKEN = "een-lang-eigen-geheim-van-minstens-16-tekens"; npm start
```

Daarna: http://localhost:3000/beheer

## Testen

```
npm test
```

Dat draait 56 tests: de spelregels (poker-handen, inzetrondes, all-in, gedeelde pot, de bordspellen), het koppelen,
melden en blokkeren (ook of het een herstart overleeft), de TURN-gegevens, het nakijken van elke boodschap, en een
hele keten met echte WebSocket-clients tegen een gestarte server.

In een echte browser kijken (twee bezoekers die praten, spelen, melden en videobellen met een nepcamera, plus
schermafbeeldingen) kan met `hulp/bekijk-in-browser.cjs`. Dat script heeft Playwright nodig; dat staat bewust niet in
dit project. Bovenin het script staat hoe je het aanroept.

## Wat erin zit

| Onderdeel | Waar |
| --- | --- |
| Startpunt | `server.js` |
| Koppelen, chat, signalen, spelletjes doorgeven | `src/app.js` |
| Wie past bij wie | `src/koppelen.js` |
| Meldingen, blokkades, cijfers | `src/moderatie.js` |
| Elke boodschap nakijken | `src/berichten.js` |
| Adressen, herkomstcontrole, tempogrenzen | `src/net.js` |
| Pagina's, `/health`, `/ice`, `/beheer`, beveiligingskoppen | `src/http.js` |
| Tijdelijke TURN-gegevens | `src/turn.js` |
| Spelregels (de server deelt en gooit) | `games.js` |
| Wat de bezoeker ziet | `public/` |
| Oude losse demo met een nepgesprek (niet meer in gebruik) | `oud/standalone.html` |

Alle instellingen staan met uitleg in `.env.voorbeeld`.

## Hoe misbruik geremd wordt

- **Melden met een reden.** Naaktheid/seksueel en minderjarige blokkeren meteen 24 uur. Drie andere meldingen van
  drie verschillende mensen binnen een dag blokkeren 1 uur. Binnen 30 dagen opnieuw: 24 uur of 7 dagen.
- **Niet te misbruiken om een ander te blokkeren:** dezelfde melder telt per persoon één keer per dag, hooguit
  3 meldingen per 10 minuten en 10 per dag per adres, en wie zelf geblokkeerd is telt niet mee.
- **Melden kan nog 3 minuten na het gesprek**, want wie iets ergs doet klikt vaak meteen weg.
- **Berichten** staan alleen tijdens het gesprek (en die 3 minuten) in het geheugen, de laatste 20. Ze worden alleen
  bewaard als de melder ze meestuurt.
- **Blokkades gaan per internetadres** en staan in `data/` (overleven een herstart). Er staat nergens een adres
  voluit: alleen een code die zonder het zout niet terug te rekenen is.
- **Grenzen:** aantal verbindingen per adres, tempo van zoeken, berichten, signalen en meldingen; elke boodschap
  wordt op vorm en grootte nagekeken.
- **Beheerpagina** `/beheer`: meldingen lezen, blokkeren, deblokkeren, cijfers.

**Wat dit niet oplost** (lees dit voor je live gaat):

- Er is **geen leeftijdscontrole**. De 18+-vraag is een vinkje. Minderjarigen kunnen erop.
- **Video wordt niet bekeken of opgenomen.** Naaktheid op video merkt niemand op tot iemand het meldt, en achteraf
  is er geen bewijs.
- Eén melding "naaktheid" of "minderjarige" blokkeert iemand 24 uur zonder dat een mens ernaar kijkt. Dat beschermt
  snel, maar een kwaadwillende kan zo een paar onschuldige mensen per dag blokkeren.
- Een blokkade per internetadres is te omzeilen (ander netwerk, VPN) en raakt soms huisgenoten of een hele school.
- Zonder iemand die de meldingen leest, is de beheerpagina niets waard.

## Live gaan: wat er nodig is

Dit moet de eigenaar regelen of beslissen. Niets hiervan is gedaan.

1. **DNS:** een A-regel voor `talkaro.zekerflex.com` naar de server.
2. **Instellingen:** kopieer `.env.voorbeeld` naar `.env` en vul in: `SITE_HOST`, `TRUST_PROXY=1`, `BEHEER_TOKEN`,
   `CONTACT_EMAIL`, en voor video `TURN_HOST` en `TURN_SECRET`.
3. **Container:** kopieer `docker-compose.voorbeeld.yml` naar `docker-compose.yml`, dan `docker compose up -d --build`.
   De app luistert alleen op `127.0.0.1:3080`.
4. **Proxy met https:** het blok uit `deploy/Caddyfile.voorbeeld` in Caddy. Zonder https geen camera.
5. **Video:** de bestaande coturn-server kan gebruikt worden: Talkaroo maakt tijdelijke inloggegevens volgens
   hetzelfde schema (`--use-auth-secret`). Dat betekent wel dat Talkaroo hetzelfde geheim krijgt als de andere site.
   Wil je dat niet delen, dan is een tweede coturn nodig. Het verkeer van videogesprekken loopt dan deels over die
   server; houd de bandbreedte in de gaten.
6. **Controleren na de eerste start:** `/health` geeft `{"ok":true}`; open de site in twee browsers op twee
   verschillende netwerken (wifi en mobiel) en test tekst én video; doe een proefmelding en kijk of die in `/beheer`
   staat.

### Beslissingen voor de eigenaar

- **Wie leest de meldingen, en hoe vaak?** Zeker bij meldingen over minderjarigen moet dat een mens zijn die weet
  wat hij moet doen (stoppen, bewaren, politie).
- **Contactadres** (`CONTACT_EMAIL`). Zolang dat leeg is, staat er nergens op de site hoe iemand je bereikt. Een site
  als deze hoort een bereikbaar adres te hebben, ook voor politie en justitie.
- **Wie is verantwoordelijk?** Op de privacypagina staat nu geen naam van een bedrijf of persoon. Laat nakijken wat
  er wettelijk moet staan (privacywet, en de Europese regels voor online diensten) voordat de site open gaat.
- **Het adres onder zekerflex.com.** De site zet geen cookies en noemt de andere site nergens. Toch ziet iedereen in
  het adres dat het bij elkaar hoort: misbruik hier straalt af op die naam, en een blokkade van het domein door een
  filter of zoekmachine raakt beide. Een eigen domeinnaam voorkomt dat.
- **De naam:** Talkaroo of Talkaro (`SITE_NAAM`).
- **Hoe streng:** de duur van blokkades en de grenzen staan bovenin `src/moderatie.js` en `src/config.js`.
- **Het drankspel:** past dat bij een site waar je de leeftijd niet controleert? Het staat in `games.js` en is met
  één regel uit de lijst te halen.

## Goed om te weten

- Toegangslogs: de app schrijft geen adressen op, en het Caddy-voorbeeld ook niet. Zet je ergens een toegangslog
  aan, pas dan de privacypagina aan.
- De reservekopie van de oude versie staat in `C:\Users\pc\talkaroo-reserve-19nov`.
