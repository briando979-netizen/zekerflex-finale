# Foto's bij het aanbod (/aanbod/<slug>)

Zelf gehost, 1600 × 1200 (4:3), via next/image als WebP op maat. Bron en
licentie per bestand; alle foto's vallen onder de Pexels License (vrij
commercieel gebruik, geen naamsvermelding vereist, niet doorverkopen als
losse foto). De fotograaf staat op de Pexels-pagina van het nummer.

| bestand | plek | bron |
|---|---|---|
| `inchecken-op-locatie.jpg` | Inchecken op locatie | Pexels #12935074 — https://www.pexels.com/photo/12935074/ |
| `certificaten-in-een-foto.jpg` | Certificaten in één foto | Pexels #6863088 — https://www.pexels.com/photo/6863088/ |
| `spoedoproep.jpg` | Spoedoproep | Pexels #4481325 — https://www.pexels.com/photo/4481325/ |
| `bedrijfscheck.jpg` | Btw-nummer en KVK-check | Pexels #10376251 — https://www.pexels.com/photo/10376251/ |

Een foto toevoegen: zet het bestand hier neer, vermeld het in deze tabel en
verwijs ernaar met `foto: { bestand, alt }` in `lib/marketing/aanbod.ts`
(`tests/marketing-aanbod.test.ts` controleert dat beide kloppen).

## Schermafbeeldingen van het product (`inkijk/`)

Eigen schermafbeeldingen van ZekerFlex, gemaakt op een tijdelijke voorbeeldzaak
("Restaurant De Proef") met verzonnen voorbeeldgegevens: alleen voornamen,
openbare adressen en een nepnummer. De voorbeeldzaak is daarna gewist. Geen
gegevens van echte klanten. Verwijzen met `inkijk: [...]` in
`lib/marketing/aanbod.ts` (`tests/aanbod-inkijk.test.ts` controleert bestand,
maten en deze lijst).

| bestand | plek | bron |
|---|---|---|
| `inkijk/horeca-kassa.webp` | Horeca: de kassa | eigen schermafbeelding, 15 nov 2026 |
| `inkijk/horeca-bord.webp` | Horeca: het bestellingenbord | eigen schermafbeelding, 15 nov 2026 |
| `inkijk/horeca-online-bestellen-telefoon.webp` | Horeca: bestellen voor gasten | eigen schermafbeelding, 15 nov 2026 |
| `inkijk/horeca-kaart.webp` | Horeca: de bezorgkaart (kaart © Kadaster, BRT Achtergrondkaart, CC BY 4.0) | eigen schermafbeelding, 15 nov 2026 |
| `inkijk/horeca-archief.webp` | Horeca: het archief | eigen schermafbeelding, 15 nov 2026 |
