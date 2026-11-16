# Uitlegvideo's voor /uitleg

De `.mp4`-bestanden hier staan **in git** (±1 MB per stuk) en komen zo mee in elke uitrol. Bij elke video hoort een poster
(`<slug>.jpg`). De pagina `app/(marketing)/uitleg/page.tsx` toont een video alleen als het bestand er is; een kaart zonder bestand
verdwijnt, er staat nergens "komt binnenkort".

Het zijn echte schermopnames van ZekerFlex met Nederlandse uitleg in onze eigen stem (Piper), gemaakt op 16 nov 2026 met
`scripts/uitleg-videos/` (daar staat ook hoe je ze opnieuw maakt of bijwerkt):

- `wat-is-zekerflex.mp4`
- `klus-plaatsen.mp4`
- `uitzenden-of-freelance.mp4`
- `uren-goedkeuren.mp4`
- `kosten-en-facturen.mp4`
- `zekerflex-uitleg-compleet.mp4` (optioneel: een lange versie van alle vijf; zonder bestand blijft dat blok weg)

Houd een video kort (H.264, 720p, onder 2 MB): hij gaat mee in de container en de eerste tik laadt alleen de metadata.
