# Marketing-fotografie

De publieke site gebruikt echte foto's op de `<Photo>`-plekken. Staat er een
bestand in deze map met de juiste naam, dan gebruikt de site die automatisch en
verdwijnt de illustratie. Geen code aanpassen.

## Huidige beelden (geplaatst)

| bestand | plek | bron | licentie |
|---|---|---|---|
| `hero-freelancer.jpg` | homepage-hero | Pexels #6205607 — Tim Douglas | Pexels License (vrij commercieel, geen naamsvermelding vereist) |
| `freelancer-at-work.jpg` | *Voor freelancers* | Pexels #4483938 — Tiger Lily | Pexels License |
| `employer-branch.jpg` | *Voor bedrijven* | Pexels #4484077 — Tiger Lily | Pexels License |
| `team-shift.jpg` | homepage-kaart + *Over ons* | Pexels #4480797 — Tiger Lily | Pexels License |

Alle beelden zijn zelf-gehost (gedownload en in de repo geplaatst) — geen
runtime-afhankelijkheid van een externe dienst.

## Vervangen of aanvullen

**Manier 1 — via de admin (aanrader).** Ga naar **`/admin` → Studio**. Onder
"Beeldplekken op de site" kun je per plek een eigen foto uploaden
(*upload* / *vervang*). JPG, PNG, WebP of AVIF, max 15 MB.

**Manier 2 — met de fotogenerator.** Draait er een lokale Stable Diffusion-server
(`IMAGE_ENABLED=true`), dan genereer je in de Studio nieuwe beelden met de
art-directed sjablonen en plaats je ze in één klik.

**Manier 3 — handmatig.** Zet het bestand in deze map met exact de naam uit de
tabel hierboven. De site pakt het meteen op.

## Specificaties (voor eigen foto's / een shoot)

| plek | verhouding | min. breedte | ideaal (4K) |
|---|---|---|---|
| `hero-freelancer.jpg` | 4:5 staand | 1600 px | 2000×2500 |
| `freelancer-at-work.jpg` | 4:3 | 2000 px | 2600×1950 |
| `employer-branch.jpg` | 4:3 | 2000 px | 2600×1950 |
| `team-shift.jpg` | 16:9 | 2400 px | 3000×1688 |

### Stijlrichtlijn (YoungOnes × Stripe)

- Echte werkende mensen in echte werkomgevingen (winkel, magazijn, horeca,
  bezorging). Geen witte studio-achtergrond, geen overdreven zakelijke stock.
- Natuurlijk licht, warme kleurtint, rustige achtergrond, onderwerp iets uit het
  midden. Ruimte overlaten voor de diep-groene merkkleur en het mint-accent.
- Geen zichtbare merken van derden. Geoptimaliseerde JPG (kwaliteit ~80), sRGB.

### Gratis, commercieel bruikbare bronnen

- **Pexels** — pexels.com — vrij voor commercieel gebruik, geen naamsvermelding.
- **Unsplash** — unsplash.com — idem.
- Zoektermen die werken: `warehouse worker`, `retail employee shelf`,
  `barista apron`, `manager tablet shop floor`, `coworkers logistics team`.
