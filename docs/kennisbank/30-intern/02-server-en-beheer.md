# Server en beheer

Alles draait op de eigen server (VPS) in Docker; niets staat bij een clouddienst met een abonnement.

## Wat er elke nacht gebeurt

- **02:30** back-up van de database en de uploads, meteen proef-teruggezet in een wegwerp-database. Met een wachtwoordzin komt er een versleutelde kopie bij, die naar een plek buiten de server gaat.
- **Elke zondag** de diepgaande hersteltest: tabel voor tabel vergeleken met het moment van de back-up. De uitkomst staat onder Admin → Systeem → Back-ups; mislukt of te laat = melding aan de eigenaar.
- **Elk uur** de bronnen van buiten (pompprijzen, minimumloon, cao-bekendmakingen, KVK-controle) en de schermcontrole van de eigen site met een echte browser.

## Live zetten

Nieuwe code gaat via GitHub (main) en de knop **Live zetten** in Admin → ZekerFlex AI. De live-zetter bouwt, past database-wijzigingen alleen toe na akkoord, controleert of de nieuwe versie gezond is en zet anders de vorige terug. Serveronderhoud (herstarten, opruimen, back-up nu, hersteltest nu) staat op dezelfde plek.

## Als iets niet werkt

1. Admin → Systeem → Foutmeldingen: daar staat de echte fout.
2. Admin → Systeem → Taken en meldingen: welke geplande taak is uitgebleven.
3. Admin → Bronnen → Schermcontrole: zo zag een browser de site het laatst.
4. Nog niet opgelost? Vraag Claude (de Bouwer) met de foutmelding erbij. Nooit zelf in de database wijzigen.

## Rapportages en kennisbank

- **Metabase** (Admin → Rapportages) richt zich zelf in; opdrachtgevers zien alleen hun eigen cijfers via het schema `bi`.
- **Deze kennisbank** (Outline) wordt gevuld vanuit `docs/kennisbank` in de code; eigen pagina's hier blijven staan bij het bijwerken.

## Toegang

Iedereen logt overal in met zijn ZekerFlex-account. Beheerders hebben tweestapsverificatie aan. Deel nooit een wachtwoord of sleutel via de chat; sleutels horen in `.env.production` op de server (alleen root).
