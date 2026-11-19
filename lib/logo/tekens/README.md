# Tekens voor de logo maker en de advertenties

`phosphor-fill.json` bevat een gekozen deelverzameling van **Phosphor Icons**, het gewicht "fill" (gevulde tekens die als beeldmerk werken).

- Bron: github.com/phosphor-icons/core, map `assets/fill`, commit `2b75f3ad12b420c9504ef05df8d2564a28f8500e`, opgehaald op 19 november 2026.
- Licentie: MIT, zie `LICENSE-phosphor.txt` in deze map (Copyright (c) 2023 Phosphor Icons).
- Aantal: 386 tekens, 175 kB.
- Per teken: `d` (de paden, ongewijzigd, op het raster van 256 × 256) en `b` (de werkelijke bounding box: x, y, breedte, hoogte, gemeten uit het getekende teken). Daarmee schaalt en centreert `index.ts` een teken op zijn echte vorm.
- Alleen tekens die uit volle paden bestaan zijn overgenomen. Geen merklogo's.

De gegevens staan in de repo; de site haalt nooit een teken live op. `index.ts` is alleen voor code die op de server rendert en hoort niet in de bundel van de browser. `trefwoorden.ts` (puur, alleen namen) koppelt woorden uit de bedrijfsnaam, de soort bedrijf en de sfeer aan een teken; `tests/logo-tekens.test.ts` controleert dat elke naam daarin bestaat.

De tekens zijn vrij te gebruiken en dus niet exclusief: een ander bedrijf kan hetzelfde teken in zijn logo hebben. Dat staat ook in de veelgestelde vragen op /logo-maker.

Overnemen of uitbreiden: de lijst met namen en het overneemscript stonden bij het bouwen buiten de repo (een klein Node-script dat de SVG's ophaalt, de paden overneemt en met sharp de bounding box meet). Een nieuw teken toevoegen = dat script opnieuw draaien met de naam erbij en de test draaien.
