# Kleurklassen die niets doen (meting 12 nov 2026)

**Wat:** klassen met een kleur of tint die niet in `tailwind.config.ts` staat. Tailwind maakt er geen CSS voor. De eigen paletten kennen alleen deze tinten:
- `neutralx`: 300–700;
- `brand`: 50, 100, 300, 500, 600, 700 en mint;
- `warn`: één kleur, zonder `-ink`.

**Gemeten:** in app/, components/ en lib/ staan 22 klassen, samen 122 keer. Scan: `scratchpad/scripts/dode-kleuren.py` van sessie 17.

**Er is nog niets veranderd.** Dit is een voorstel. Een klasse laten werken verandert het uiterlijk van bestaande schermen, dus eerst een besluit en schermafbeeldingen.

## Wat je nu ziet

Een dode klasse doet niet altijd *niets*:
- **Rand of scheidingslijn** (`border-…`, `divide-…`): Tailwind valt terug op de standaardrandkleur, gray-200 (#E5E7EB). Je ziet dus een grijze lijn.
- **Ring** (`ring-…`): de standaardring is blauw (#3B82F6, 50%). Je ziet een blauwe focusring in plaats van het huisstijlgroen.
- **Achtergrond, tekst of verloop** (`bg-…`, `text-…`, `to-…`): er gebeurt niets. Er is geen vlak, de tekst houdt de kleur van zijn ouder, en een verloop loopt naar transparant.

## Per klasse

| Klasse | Keer | Bestanden (o.a.) | Nu te zien | Voorstel |
|---|---|---|---|---|
| `border-neutralx-200` | 31 | open-diensten (+3d), administratie | grijze rand #E5E7EB | → `border-hair` (#E6E7E1): bijna gelijk, uiterlijk blijft |
| `border-brand-200` | 18 | werkgever-start, administratie (17 bestanden) | grijze rand | A: → `border-hair` (blijft grijs) · B: `brand.200` toevoegen tussen 100 en 300 (wordt lichtgroen, zoals bedoeld) |
| `bg-neutralx-100` | 14 | administratie, paspoort | geen vlak | → `bg-paper-soft` (#F4F5F1; heeft al een donkere regel) |
| `text-brand-800` | 8 | PlanPicker, AiFeaturesPanel | kleur van de ouder (meestal inkt) | → `text-brand-700` |
| `hover:border-brand-400` | 8 | AddToCalendarButton, CandidateCardButton | niets bij aanwijzen | → `hover:border-brand-300` |
| `bg-neutralx-50` | 7 | paspoort, CalendarFeedCard | geen vlak | → `bg-paper` |
| `bg-neutralx-200` | 6 | paspoort (openbaar), administratie | geen vlak | → `bg-paper-200` (#E9EAE3) |
| `text-warn-ink` | 6 | OpLocatie | kleur van de ouder | → `text-warn` (amber = wacht op jou) |
| `divide-neutralx-200` / `-100` | 3 + 1 | open-diensten, MileageLog | grijze lijn | → `divide-hair` |
| **`bg-brand-400`** | 3 | **vooruitblik** (balk van de huidige week), administratie (voortgangsbalk) | **geen vlak: de balk is onzichtbaar** | → `bg-brand-300` (lichter dan de andere weken, zoals bedoeld). **Echte fout, voorrang** |
| `hover:bg-neutralx-50/100/200` | 3 + 2 + 1 | administratie, EersteIndrukMelding, ritten | niets bij aanwijzen | → `hover:bg-paper-soft` (heeft al een donkere regel) |
| `disabled:bg-neutralx-100` | 2 | EersteIndrukScherm, MileageLog | uitgeschakelde knop zonder vlak | → `disabled:bg-paper-soft` |
| `ring-brand-400` (+ `/70`, `/25`, `focus-visible:`, `focus-within:`) | 7 | ChatDock, InboxPage, MessageBubble, MessageActions, Iconen | blauwe focusring | → `ring-brand-300` (met dezelfde doorzichtigheid) |
| `text-brand-400` | 1 | EarningsGoalCard | kleur van de ouder | → `text-brand-300` |
| `to-brand-400/40` | 1 | FairPayMeter | verloop naar transparant | → `to-brand-300/40` |

## Voorstel voor de volgorde

1. **Nu, klein:** `bg-brand-400` → `bg-brand-300`. Op /dashboard/vooruitblik is de balk van deze week nu onzichtbaar.
2. **Zonder zichtbaar verschil:** `border-neutralx-200`, `divide-neutralx-*` → `*-hair`, en `border-brand-200` volgens optie A. Dat is gray-200 naar #E6E7E1; met het oog niet te zien, maar wel met een pixelvergelijking te bewijzen.
3. **Met zichtbaar verschil (de bedoeling komt terug), schermafbeeldingen nodig:**
   - de vlakken: `bg-neutralx-*` → `paper*`;
   - aanwijzen en uitgeschakeld;
   - de focusringen, die van blauw naar huisstijl gaan;
   - de tekstkleuren;
   - `border-brand-200` volgens optie B.
4. **Daarna:** een bewaker die een kleurklasse buiten de schaal laat falen, met dezelfde aanpak als `tests/donker-dekking.test.ts`.

Na elke stap: de donkere modus nalopen. De vervangers `paper-soft` en `hair` hebben al een donkere regel; `brand-300` volgt de huisstijl via de CSS-variabele.
