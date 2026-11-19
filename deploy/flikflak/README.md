# FlikFlak â€” korte-video app, gehost binnen ZekerFlex

FlikFlak is de eigen korte-video app van de eigenaar (TikTok-achtig). Hij draait als
eigen kleine container naast ZekerFlex en is bereikbaar op een eigen subdomein
(standaard `flikflak.37-97-226-24.sslip.io`; met `FLIKFLAK_HOST=flikflak.zekerflex.com`
in `.env.production` op de nette naam, zodra het A/AAAA-record naar de VPS wijst).

## Waar het uit bestaat
- `server.js` â€” Express + multer + ws. Geen database van de app: eigen opslag.
- `public/` â€” de app zelf (Ã©Ã©n pagina) en `beheer.html` (de moderatiepagina `/beheer`).
- `seed/` â€” demo-inhoud voor de allereerste start (db.json + een paar video's). De
  demo-accounts zijn **niet** in te loggen (willekeurige wachtwoord-hash); het is
  alleen showcase. Opnieuw maken: `node seed-build` vanuit de lokale FlikFlak-map.
- `Dockerfile` + `entrypoint.sh` â€” bouwen en, bij een leeg volume, de demo erin zetten.

## Opslag
Alles wat de app schrijft (geÃ¼ploade video's + `db.json`) staat op het volume
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
`cd` naar de lokale FlikFlak-map en `node server.js` â†’ http://localhost:3001.
De repo-kopie hier is de versie die live draait; houd beide gelijk.

## Functies (ronde A, 19 nov)
- **Fotoposts**: 1-10 foto's als carrousel met muziek uit de eigen bibliotheek (`public/muziek`, zelf gemaakt, rechtenvrij).
- **Videobewerker** vÃ³Ã³r het plaatsen: knippen, snelheid, tekst op de video, muziek eronder â€” in de browser (canvas + MediaRecorder).
- **Mappen** (collecties): video's bewaren in eigen mappen, alleen voor jezelf. Profiel â†’ Mappen; Delen â†’ "In een map".
- **Challenges**: hashtag + titel + einddatum, ranglijst op likes. Ontdekken â†’ Challenges, `#/challenges`, `#/challenge/<tag>`.
- **Statistieken** voor makers (`#/stats`): totalen, weergaven per dag (14 dagen), per video.
- **Kijkgeschiedenis** (`#/geschiedenis`) en **"Niet geÃ¯nteresseerd"** (telt echt mee in de feed).
- **ZekerFlex-koppeling**: een product uit de shop of een klus aan je post koppelen (alleen een zekerflex.com-link, kaartje onder de video).
- **Deel-link met voorbeeld** (`/s/<id>`): titel + foto in WhatsApp/social, stuurt door naar de app.
- **Installeerbaar als app** (PWA): manifest + service worker (`sw.js`, alleen de schil; api/uploads altijd vers).

## Functies (ronde B, 19 nov)
- **LIVE**: de maker pint een bericht vast (ðŸ“Œ, voor alle kijkers) en kan een kijker verwijderen (tik op zijn bericht); die komt niet opnieuw binnen.
- **Inplannen**: een video of fotopost tot 30 dagen vooruit plaatsen; tot dan alleen zichtbaar voor de maker (â° op het profiel), volgers krijgen de melding op het moment zelf (`setInterval` in server.js, elke 30 s).

## Functies (ronde C, 19 nov)
- **Instellingen** (`#/instellingen`): privÃ© account, wie mag reageren / berichten sturen (iedereen, vrienden, niemand), geblokkeerde woorden in reacties, opslaan toestaan, thema (zoals je telefoon / donker / licht), pauze-herinnering.
- **PrivÃ© account** met volgverzoeken (`#/verzoeken`): alleen goedgekeurde volgers zien de video's; het profiel staat op slot voor anderen.
- **Reposten** (Delen â†’ â™») met een tab Reposts op het profiel; **reactie vastpinnen** door de maker.
- **Concepten** (ðŸ“ bij het plaatsen) en geplande posts in de tab Concepten, met "Nu plaatsen".
- **Prestaties** (badges) op het profiel, berekend uit wat iemand echt deed.
- **AVG**: eigen gegevens downloaden (`/api/export`, zonder IP's) en account zelf verwijderen (`DELETE /api/account`).
- Licht thema alleen om de video heen; feed, LIVE en camera blijven donker.

## Functies (ronde D, 19 nov)
- **Chat**: spraakberichten (ðŸŽ¤, MediaRecorder â†’ `audio` in het bericht) en emoji-reacties op berichten (dubbeltik op de ballon; live via ws `message:react`).
- **Peilingen** op een video of fotopost (vraag + 2-4 antwoorden, Ã©Ã©n stem per persoon, percentages na het stemmen).
- **Video-antwoord op een reactie** (alleen de maker): `#/upload?antwoord=<reactie-id>`; sticker op de video en link bij de reactie.
- **Series** (afspeellijsten van eigen video's) met tab Series op het profiel en "deel 2/5"-chip op de video; `#/serie/<id>`.
- **Bedrijfsaccount**: ðŸ¢-label, website-link en "Werk bij ons"-knop (alleen https-links; bedoeld voor klussen/vacatures op ZekerFlex).
- **Toegankelijkheid**: grotere tekst, minder beweging (geen animaties, foto's schuiven niet vanzelf). Standaardthema is donker.

## Functies (ronde E, 19 nov)
- **Meldingen per soort** aan/uit (Instellingen â†’ Meldingen); de server slaat een uitgezette soort over.
- **Account & veiligheid**: wachtwoord wijzigen (andere sessies gaan eruit), overal uitloggen, geblokkeerde accounts beheren (`#/geblokkeerd`).
- **Gesprekken** dempen (geen pop-up/teller) of bij jezelf verwijderen (de ander houdt zijn kopie).
- **Vrienden uitnodigen**: link `/?ref=<gebruikersnaam>`; wie zich zo aanmeldt, staat als "uitgenodigd door"; prestatie ðŸ¤ bij 3.

## Functies (ronde F, 19 nov)
- **Stories**: 24 uur zichtbaar in een strook bovenaan de feed (eerst wie je volgt, dan jijzelf), niet op het profiel/in de feed; viewer met balkjes en "gezien"; verlopen stories worden elke 10 min opgeruimd.
- **Groepschats** (max 20 leden): maken vanuit de inbox, berichten en spraakberichten, live via ws (`groep`), beheerder voegt toe/verwijdert, naam wijzigen, dempen, verlaten; ongelezen telt mee in de badge.
- **Ondertitels**: regels "van-tot: tekst" bij het plaatsen; overlay die meeloopt met de video.

## Functies (ronde G, 19 nov) â€” beheer voor de eigenaar
- **/beheer**: accounts **verifiÃ«ren** (blauw vinkje) en **schorsen** (7 dagen: niet inloggen, video's tijdelijk onzichtbaar), video's **uitlichten** (â­ label + 3Ã— hoger in "Voor jou"), **aankondiging** naar alle accounts (als FlikFlak in Inbox â†’ Activiteit), **dashboard** met per dag nieuwe accounts, posts en weergaven, plus actief-7d/groepen/LIVE in de kpi's.
- **Hashtags volgen**: knop op de tagpagina; video's met die tag komen in je Volgend-feed.
- **Foto bij een reactie** (ðŸ“· in het reactievak).

## Functies (ronde H, 19 nov) â€” veiligheid en ontdekken
- **Melden** van reacties en accounts (naast video's); alles in /beheer â†’ Meldingen met de passende actie (reactie weg, schorsen, account weg).
- **Woordenlijst van het beheer** (/beheer â†’ Woordenlijst): platformbreed geweigerd in reacties Ã©n bijschriften (los van de persoonlijke woordfilter).
- **16 jaar of ouder** verplicht vinkje bij het aanmelden (server controleert).
- **Reacties sorteren** (populair / nieuwste), **zoeken** vindt ook challenges en series, **interesses kiezen** na het aanmelden (volgt hashtags â†’ Volgend-feed).

## Meldingen op het apparaat en QR-codes (ronde I, 19 nov 2026)

- **Web push:** de VAPID-sleutels worden bij de eerste start gemaakt en bewaard in
  `/data/data/vapid.json` (op het volume, geen omgevingsvariabele). Een abonnement
  hoort bij een account (max. 5 apparaten) en gaat weg bij 404/410 van de pushdienst.
  De server stuurt alleen een push als iemand niet in de app zit (geen open
  verbinding): likes, reacties, volgers, vermeldingen, LIVE, berichten. Aanzetten in
  Instellingen → Meldingen → "Meldingen op dit apparaat" of via de hint in de inbox.
- **QR-code:** `GET /api/qr?pad=/s/<id>` tekent een svg van een eigen pagina (alleen
  een pad op FlikFlak). Knop "QR-code" in de deel-sheet en "Profiel delen" op het profiel.