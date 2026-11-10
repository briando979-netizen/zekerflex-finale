# ZekerFlex voor iPhone

De iPhone-app opent zekerflex.com in app-modus, net als de Android-app (android-twa). Daarbij
komen een paar dingen die alleen een echte app kan. Daardoor is het meer dan een website in
een kader (App Store-richtlijn 4.2):

- **Pushmeldingen via Apple (APNs).** Rechtstreeks, zonder Firebase. Server: `lib/notifications/push/apns.ts`,
  `/api/me/apns`. Na het inloggen vraagt de app één keer om toestemming.
- **De chip van je ID-kaart of paspoort lezen (NFC, iPhone 7 en nieuwer).** `ChipLezer.swift`, zelfde
  stappen als `ChipActivity` op Android: eerst "Ben jij dit?", dan alleen DG1 en het SOD naar de
  server (`/api/chip/klaar`). Nooit de pasfoto (DG2), niets bewaard of gelogd.
- **Passkeys en universele links.** Een link naar zekerflex.com/dashboard… of de QR-code van
  "Verder op je telefoon" opent de app. Server: `app/.well-known/apple-app-site-association`
  (aan zodra `APPLE_TEAM_ID` op de server staat).
- **Camera, microfoon en locatie.** Voor de ID-scan, videobellen en inchecken.

## Wat Apple anders wil dan Google

De app start met `/start?utm_source=ios`. De middleware zet dan dezelfde app-cookie als bij
Android, plus `zf_app_ios` (`lib/app-mode.ts`). In de iPhone-app:

- **Geen digitale aankopen** (richtlijn 3.1.1: die mogen alleen via Apple's eigen betaling).
  `components/app/NietInIphone.tsx` verbergt de koopknoppen van:
  - het API-abonnement;
  - website-beheer;
  - wifi/VPN;
  - domeinnamen en domeinfacturen;
  - horeca-modules;
  - telefonie.

  Betalen voor werk (facturen van klussen), de shop (fysieke spullen), horecagasten en rijlessen
  mag gewoon.
- **Geen "inloggen met Google"**: Google weigert inloggen in een ingebouwde webview
  ("disallowed_useragent"). Wel "inloggen met Apple" (`lib/auth/apple.ts`, aan zodra de sleutel
  op de server staat; owner-todo `apple-inloggen`), e-mail met wachtwoord en passkeys.
- **Hetzelfde als op Android:** de bank- en geldfuncties zijn verborgen.

## Bouwen (zonder eigen Mac)

Het Xcode-project wordt gemaakt uit `project.yml` met XcodeGen, op een Mac in de cloud:

- **Codemagic** (`codemagic.yaml`, gratis tot 500 minuten per maand; de eerste keuze). Zet de
  sleutel van App Store Connect in Codemagic onder Integrations → App Store Connect, met de
  naam "ZekerFlex", en start de workflow "ZekerFlex voor iPhone".
- **GitHub** (`.github/workflows.disabled/ios.yml`). GitHub Actions staat uit (billing-lock,
  zie de README in die map). Is dat opgelost, zet het bestand dan in `.github/workflows/` en
  start Actions → iOS-app → Run workflow met een buildnummer. Alleen met de hand, dus het kost
  niets zolang je hem niet start. Nodig als repository-secrets:
  - `ASC_KEY_P8`: de inhoud van het .p8-bestand;
  - `ASC_KEY_ID`;
  - `ASC_ISSUER_ID`;
  - `APPLE_TEAM_ID`.

Ondertekenen, één keer instellen, in deze volgorde:

1. **App-ID** `com.zekerflex.app`, met Push Notifications, NFC Tag Reading en Associated Domains
   aan. Claude maakt het aan met de API-sleutel. Dit moet vóór het profiel: een profiel van vóór
   die rechten mist ze, en dan faalt het ondertekenen.
2. **In Codemagic: een Apple Distribution-certificaat.** Ga naar Teams → Code signing identities
   → iOS certificates → Generate certificate, via de integratie "ZekerFlex".
3. **Een App Store-profiel** voor `com.zekerflex.app` met dat certificaat. Claude maakt het aan
   met de API-sleutel, of je doet het in Codemagic → iOS provisioning profiles → Fetch profiles.

Daarna ondertekent Codemagic elke build zelf (`ios_signing` in codemagic.yaml). In git staat
niets geheims. De build gaat rechtstreeks naar TestFlight.

Apple neemt sinds 28 april 2026 alleen builds met Xcode 26 en de iOS 26 SDK aan. Codemagic
gebruikt `xcode: latest`; het GitHub-recept staat op `macos-26`. Gebruik één bouwplek: de
buildnummers van Codemagic (`$BUILD_NUMBER`) en van GitHub (zelf ingevuld) lopen anders niet
op elkaar door.

## Op de server (sleutels, owner-todo "ios-app")

- `APPLE_TEAM_ID`: de Team ID van het ontwikkelaarsaccount. Nodig voor passkeys en links in de app.
- `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`: een sleutel met "Apple Push Notifications service".
  Gebruik een andere sleutel dan die voor App Store Connect.
- `APNS_TOPIC` (standaard `com.zekerflex.app`). `APNS_SANDBOX=1` alleen voor builds uit Xcode zelf.

## Indienen bij Apple (App Store Connect)

1. Maak een nieuwe app aan: iOS, naam ZekerFlex, taal Nederlands, bundel-id `com.zekerflex.app`.
2. Vul de links in: privacy `https://zekerflex.com/privacy`, ondersteuning `https://zekerflex.com/contact`.
3. Maak schermafbeeldingen van een iPhone van 6,9 inch (of een simulator), voor de werker en de opdrachtgever.
4. Geef de beoordelaar een **testaccount**: een werker en een opdrachtgever met een adres op
   `.test`, met e-mail bevestigd. Leg in de notitie uit dat ZekerFlex een uitzend- en
   flexplatform is, en dat betalingen voor werk tussen bedrijven gaan (geen digitale goederen).
5. Privacy-labels:
   - contactgegevens (naam, e-mail, telefoon);
   - identificatoren (account);
   - locatie (alleen bij inchecken);
   - foto's (ID-controle);
   - financiële gegevens (IBAN voor uitbetaling).

   Niets daarvan wordt gebruikt voor tracking of advertenties.
6. Account verwijderen kan in de app (`/account-verwijderen`), zoals Apple eist.

## Later

- "Inloggen met Apple" toevoegen. Dan mag "inloggen met Google" ook in de iPhone-app.
- Rijschool-apps als aparte iPhone-apps (nu alleen Android).
