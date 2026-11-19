# FlikFlak — korte-video app, gehost binnen ZekerFlex

FlikFlak is de eigen korte-video app van de eigenaar (TikTok-achtig). Hij draait als
eigen kleine container naast ZekerFlex en is bereikbaar op een eigen subdomein
(standaard `flikflak.37-97-226-24.sslip.io`; met `FLIKFLAK_HOST=flikflak.zekerflex.com`
in `.env.production` op de nette naam, zodra het A/AAAA-record naar de VPS wijst).

## Waar het uit bestaat
- `server.js` — Express + multer + ws. Geen database van de app: eigen opslag.
- `public/` — de app zelf (één pagina) en `beheer.html` (de moderatiepagina `/beheer`).
- `seed/` — demo-inhoud voor de allereerste start (db.json + een paar video's). De
  demo-accounts zijn **niet** in te loggen (willekeurige wachtwoord-hash); het is
  alleen showcase. Opnieuw maken: `node seed-build` vanuit de lokale FlikFlak-map.
- `Dockerfile` + `entrypoint.sh` — bouwen en, bij een leeg volume, de demo erin zetten.

## Opslag
Alles wat de app schrijft (geüploade video's + `db.json`) staat op het volume
`flikflak-data` (`/data` in de container), dus het overleeft een uitrol. Nooit in de
container zelf: die wordt bij elke uitrol vervangen.

## Netwerk
Eigen netwerk `flikflak-net`; alleen Caddy praat ermee. FlikFlak kan **niet** bij de
echte database of Redis van ZekerFlex.

## Beheer / moderatie (openlijk gemeld)
`/beheer` toont meldingen, video's en accounts, en kan ze weghalen. Het is dicht
zonder `FF_ADMIN_TOKEN` (door `env-aanvullen.sh` aangemaakt in `.env.production`).
Bij het aanmelden ziet een gebruiker de huisregels: we bewaren gebruikersnaam, wat je
plaatst en je IP-adres (met tijdstip) om misbruik tegen te gaan en meldingen te
behandelen. Dat staat open in de app, niet verborgen.

## Lokaal draaien
`cd` naar de lokale FlikFlak-map en `node server.js` → http://localhost:3001.
De repo-kopie hier is de versie die live draait; houd beide gelijk.

## Functies (ronde A, 19 nov)
- **Fotoposts**: 1-10 foto's als carrousel met muziek uit de eigen bibliotheek (`public/muziek`, zelf gemaakt, rechtenvrij).
- **Videobewerker** vóór het plaatsen: knippen, snelheid, tekst op de video, muziek eronder — in de browser (canvas + MediaRecorder).
- **Mappen** (collecties): video's bewaren in eigen mappen, alleen voor jezelf. Profiel → Mappen; Delen → "In een map".
- **Challenges**: hashtag + titel + einddatum, ranglijst op likes. Ontdekken → Challenges, `#/challenges`, `#/challenge/<tag>`.
- **Statistieken** voor makers (`#/stats`): totalen, weergaven per dag (14 dagen), per video.
- **Kijkgeschiedenis** (`#/geschiedenis`) en **"Niet geïnteresseerd"** (telt echt mee in de feed).
- **ZekerFlex-koppeling**: een product uit de shop of een klus aan je post koppelen (alleen een zekerflex.com-link, kaartje onder de video).
- **Deel-link met voorbeeld** (`/s/<id>`): titel + foto in WhatsApp/social, stuurt door naar de app.
- **Installeerbaar als app** (PWA): manifest + service worker (`sw.js`, alleen de schil; api/uploads altijd vers).

## Functies (ronde B, 19 nov)
- **LIVE**: de maker pint een bericht vast (📌, voor alle kijkers) en kan een kijker verwijderen (tik op zijn bericht); die komt niet opnieuw binnen.
- **Inplannen**: een video of fotopost tot 30 dagen vooruit plaatsen; tot dan alleen zichtbaar voor de maker (⏰ op het profiel), volgers krijgen de melding op het moment zelf (`setInterval` in server.js, elke 30 s).

## Functies (ronde C, 19 nov)
- **Instellingen** (`#/instellingen`): privé account, wie mag reageren / berichten sturen (iedereen, vrienden, niemand), geblokkeerde woorden in reacties, opslaan toestaan, thema (zoals je telefoon / donker / licht), pauze-herinnering.
- **Privé account** met volgverzoeken (`#/verzoeken`): alleen goedgekeurde volgers zien de video's; het profiel staat op slot voor anderen.
- **Reposten** (Delen → ♻) met een tab Reposts op het profiel; **reactie vastpinnen** door de maker.
- **Concepten** (📝 bij het plaatsen) en geplande posts in de tab Concepten, met "Nu plaatsen".
- **Prestaties** (badges) op het profiel, berekend uit wat iemand echt deed.
- **AVG**: eigen gegevens downloaden (`/api/export`, zonder IP's) en account zelf verwijderen (`DELETE /api/account`).
- Licht thema alleen om de video heen; feed, LIVE en camera blijven donker.

## Functies (ronde D, 19 nov)
- **Chat**: spraakberichten (🎤, MediaRecorder → `audio` in het bericht) en emoji-reacties op berichten (dubbeltik op de ballon; live via ws `message:react`).
- **Peilingen** op een video of fotopost (vraag + 2-4 antwoorden, één stem per persoon, percentages na het stemmen).
- **Video-antwoord op een reactie** (alleen de maker): `#/upload?antwoord=<reactie-id>`; sticker op de video en link bij de reactie.
- **Series** (afspeellijsten van eigen video's) met tab Series op het profiel en "deel 2/5"-chip op de video; `#/serie/<id>`.
- **Bedrijfsaccount**: 🏢-label, website-link en "Werk bij ons"-knop (alleen https-links; bedoeld voor klussen/vacatures op ZekerFlex).
- **Toegankelijkheid**: grotere tekst, minder beweging (geen animaties, foto's schuiven niet vanzelf). Standaardthema is donker.

## Functies (ronde E, 19 nov)
- **Meldingen per soort** aan/uit (Instellingen → Meldingen); de server slaat een uitgezette soort over.
- **Account & veiligheid**: wachtwoord wijzigen (andere sessies gaan eruit), overal uitloggen, geblokkeerde accounts beheren (`#/geblokkeerd`).
- **Gesprekken** dempen (geen pop-up/teller) of bij jezelf verwijderen (de ander houdt zijn kopie).
- **Vrienden uitnodigen**: link `/?ref=<gebruikersnaam>`; wie zich zo aanmeldt, staat als "uitgenodigd door"; prestatie 🤝 bij 3.

## Functies (ronde F, 19 nov)
- **Stories**: 24 uur zichtbaar in een strook bovenaan de feed (eerst wie je volgt, dan jijzelf), niet op het profiel/in de feed; viewer met balkjes en "gezien"; verlopen stories worden elke 10 min opgeruimd.
- **Groepschats** (max 20 leden): maken vanuit de inbox, berichten en spraakberichten, live via ws (`groep`), beheerder voegt toe/verwijdert, naam wijzigen, dempen, verlaten; ongelezen telt mee in de badge.
- **Ondertitels**: regels "van-tot: tekst" bij het plaatsen; overlay die meeloopt met de video.

## Functies (ronde G, 19 nov) — beheer voor de eigenaar
- **/beheer**: accounts **verifiëren** (blauw vinkje) en **schorsen** (7 dagen: niet inloggen, video's tijdelijk onzichtbaar), video's **uitlichten** (⭐ label + 3× hoger in "Voor jou"), **aankondiging** naar alle accounts (als FlikFlak in Inbox → Activiteit), **dashboard** met per dag nieuwe accounts, posts en weergaven, plus actief-7d/groepen/LIVE in de kpi's.
- **Hashtags volgen**: knop op de tagpagina; video's met die tag komen in je Volgend-feed.
- **Foto bij een reactie** (📷 in het reactievak).

## Functies (ronde H, 19 nov) — veiligheid en ontdekken
- **Melden** van reacties en accounts (naast video's); alles in /beheer → Meldingen met de passende actie (reactie weg, schorsen, account weg).
- **Woordenlijst van het beheer** (/beheer → Woordenlijst): platformbreed geweigerd in reacties én bijschriften (los van de persoonlijke woordfilter).
- **16 jaar of ouder** verplicht vinkje bij het aanmelden (server controleert).
- **Reacties sorteren** (populair / nieuwste), **zoeken** vindt ook challenges en series, **interesses kiezen** na het aanmelden (volgt hashtags → Volgend-feed).
