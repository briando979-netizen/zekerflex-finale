/**
 * YouTube oprichter-video script voor ZekerFlex
 * Format: 2-3 minuten, founder pitch
 * Stijl: Casual, echt, geen BS. Nederlands, authentieke stem.
 * Gemaakt: 28 nov 2026
 */

export type SectieType = "hook" | "problem" | "solution" | "why-now" | "cta";
export type ClipType = "spreker" | "b-roll" | "grafiek" | "logo" | "app-scherm" | "tekst";

export interface ScriptClip {
  id: string;
  start: number; // in seconden
  duur: number;
  soort: ClipType;
  sectie: SectieType;
  spreker?: string; // Tekst die wordt ingesproken
  beschrijving?: string; // Wat te zien is
  noten?: string; // Productienoten
  b_roll?: string; // Voorstel voor b-roll bronnen
}

export interface OprichterScript {
  titel: string;
  versie: string;
  totaalDuur: number; // seconden
  taal: "nl";
  clips: ScriptClip[];
  productieNoten: string;
  muziek?: {
    titel: string;
    artiestNaam: string;
    bpm: number;
    mood: string;
  };
}

// ============================================================================
// HOOK (0-15 seconden)
// ============================================================================

const hookClips: ScriptClip[] = [
  {
    id: "hook-1",
    start: 0,
    duur: 2,
    soort: "logo",
    sectie: "hook",
    beschrijving: "ZekerFlex logo verschijnt met een puntige impact",
    noten: "Snelle zoom-in, strakke transactie",
  },
  {
    id: "hook-2",
    start: 2,
    duur: 11,
    soort: "spreker",
    sectie: "hook",
    spreker:
      "Flexwerk in Nederland is kapot. \n" +
      "Werkzoekenden verdwalen in chaos.\n" +
      "Werkgevers weten niet wie ze kunnen vertrouwen.\n" +
      "Allemaal geld dat niet naar waar het hoort.",
    beschrijving: "Oprichter staat voor een muur van chaos (grafisch: rode lijnen, verwarring)",
    noten: "Intense blik, rechtstaan, slow-mo movement",
    b_roll:
      "Abstract chaos: snel wisselende fragments van digitale rommel, ongelijksoortige job-boards, " +
      "verwaarde werkers",
  },
  {
    id: "hook-3",
    start: 13,
    duur: 2,
    soort: "spreker",
    sectie: "hook",
    spreker:
      "Dit is hoe we het fixen. \n" +
      "In 15 seconden weet je alles.",
    beschrijving: "Oprichter richt zich op camera, vertrouwen en duidelijkheid",
    noten: "Direct eye contact, voelbare shift van chaos naar helderheid",
    b_roll: "Logo en sluiting worden groen (vertrouwen/oplossing kleur)",
  },
];

// ============================================================================
// PROBLEM (15-45 seconden)
// ============================================================================

const problemClips: ScriptClip[] = [
  {
    id: "problem-1",
    start: 15,
    duur: 5,
    soort: "spreker",
    sectie: "problem",
    spreker:
      "In Nederland zoeken 500.000 mensen flexwerk. \n" +
      "Maar bedrijven vinden hen niet.",
    beschrijving:
      "Grafiek stijgt naar boven (500K aantal), " +
      "dan kapot pijl die niet aankomt",
    noten: "Duidelijke data-visualisatie, rood accent",
    b_roll:
      "Screenshots van bestaande chaos-board sites (slechts verpixeld), " +
      "frustratie-gelaatsuitdrukking",
  },
  {
    id: "problem-2",
    start: 20,
    duur: 5,
    soort: "spreker",
    sectie: "problem",
    spreker:
      "En als ze elkaar vinden, " +
      "dan is het rammelen en gedoe: " +
      "geen verificatie, geen vertrouwen.",
    beschrijving:
      "Chaos-fragmenten: foutmeldingen, " +
      "vraagtekens, onveilige verbindingen",
    noten: "Tempo neemt toe, onrust voelbaar",
    b_roll:
      "Animatie van twee figuren die elkaar missen, " +
      "fronsende gezichten, foutmeldingen op scherm",
  },
  {
    id: "problem-3",
    start: 25,
    duur: 5,
    soort: "spreker",
    sectie: "problem",
    spreker: "Drie weken tot die eerste klus in de planning staat.",
    beschrijving:
      "Kalender draait snel door, ' ' weken gaan voorbij",
    noten: "Urgentie-gevoel",
    b_roll:
      "Animatie van kalender-bladen die wegvliegen, " +
      "geld dat verdwijnt (symboolisch)",
  },
  {
    id: "problem-4",
    start: 30,
    duur: 15,
    soort: "spreker",
    sectie: "problem",
    spreker:
      "Dus bedrijven betalen honderden euro's " +
      "voor recruiters die niet beter zijn " +
      "dan een zoekmachine van vijftien jaar geleden.",
    beschrijving:
      "Geldstapels, verouderde computer met slome " +
      "zoekresultaten",
    noten: "Ironie en frustratie voelbaar",
    b_roll:
      "Geld-animatie (euro's), " +
      "80s-computer die heel langzaam laadt, " +
      "recruiter-silhouetten met twijfelen",
  },
];

// ============================================================================
// SOLUTION (45-120 seconden)
// ============================================================================

const solutionClips: ScriptClip[] = [
  {
    id: "solution-1",
    start: 45,
    duur: 5,
    soort: "spreker",
    sectie: "solution",
    spreker:
      "ZekerFlex verandert het. " +
      "Geverifieerde werkers, echte keuze.",
    beschrijving: "App-scherm verschijnt met duidelijke, schone interface",
    noten: "Moment van helderheid, groen accent",
    b_roll: "App-scherm van werker-profiel met verificatiebadge",
  },
  {
    id: "solution-2",
    start: 50,
    duur: 8,
    soort: "spreker",
    sectie: "solution",
    spreker:
      "Werkers maken in vijf minuten een profiel. " +
      "ID gescand, achtergrond gecontroleerd, " +
      "klaar.",
    beschrijving: "Animation van onboarding-flow: ID-scan, check, groen vinkje",
    noten: "Snelheid en eenvoud voelbaar",
    b_roll:
      "Simulatie van ID-scan, " +
      "verificatie-progressiebalk, " +
      "klaar-scherm met geluid",
  },
  {
    id: "solution-3",
    start: 58,
    duur: 7,
    soort: "spreker",
    sectie: "solution",
    spreker:
      "Bedrijven zien álle geschikte werkers " +
      "op het platform, " +
      "in seconden.",
    beschrijving:
      "Zoekresultaten vullen razendsnel het scherm, " +
      "alle geverifieerd",
    noten: "Schoon, modern design",
    b_roll:
      "App-scherm werkgever: " +
      "zoekresultaten animeren in, " +
      "each met badge",
  },
  {
    id: "solution-4",
    start: 65,
    duur: 8,
    soort: "spreker",
    sectie: "solution",
    spreker:
      "In plaats van drie weken, " +
      "matched ZekerFlex werkers en klussen " +
      "in 24 uur.",
    beschrijving:
      "Klok draait snel door, " +
      "24-uur markering stopt, " +
      "verbinding in real-time zichtbaar",
    noten: "Versnelling en efficiëntie voelbaar",
    b_roll:
      "Klok-animatie, " +
      "real-time matching-puls, " +
      "werker en werkgever elkaar vinden",
  },
  {
    id: "solution-5",
    start: 73,
    duur: 47,
    soort: "spreker",
    sectie: "solution",
    spreker:
      "Geen gestotter, geen BS. \n" +
      "Transparante prijs.",
    beschrijving:
      "Prijsbord verschijnt: duidelijk, eerlijk, " +
      "geen verborgen toeslagen",
    noten: "Vertrouwen en duidelijkheid",
    b_roll:
      "Prisjlijst-animatie, " +
      "veel groter dan andere platforms, " +
      "geen asterisken",
  },
];

// ============================================================================
// WHY NOW (120-150 seconden)
// ============================================================================

const whyNowClips: ScriptClip[] = [
  {
    id: "why-now-1",
    start: 120,
    duur: 7,
    soort: "spreker",
    sectie: "why-now",
    spreker:
      "Na COVID en inflatie, " +
      "iedereen in Nederland kan flexwerk gebruiken.",
    beschrijving:
      "Stijgende grafiek van flexwerk-zoeken, " +
      "economisch teken",
    noten: "Data-driven maar voelbaar",
    b_roll:
      "Grafiek stijgt, " +
      "huizen, " +
      "gezinnen aan tafel met zorgen",
  },
  {
    id: "why-now-2",
    start: 127,
    duur: 7,
    soort: "spreker",
    sectie: "why-now",
    spreker:
      "Bedrijven durven niet meer blind rekruteren. " +
      "Ze willen echte mensen, " +
      "echte keuze.",
    beschrijving:
      "Bedrijfsleider aan tafel, knikje, " +
      "vertrouwen-uitdrukking",
    noten: "Human touch, real gesprek",
    b_roll:
      "Kantoor-scène, " +
      "bedrijfsleider die nadenkt en beslist, " +
      "slimme gezichten",
  },
  {
    id: "why-now-3",
    start: 134,
    duur: 16,
    soort: "spreker",
    sectie: "why-now",
    spreker:
      "En omdat het platform van ons is, " +
      "in Nederland, " +
      "luisteren we. Geen Silicon Valley-agenda. " +
      "Geen geblindeerdoekte AI. " +
      "Gewoon: goed werk, eerlijk geld.",
    beschrijving:
      "Oprichter tegen camera, rechter, " +
      "duidelijke boodschap",
    noten: "Intentie en waarden centraal",
    b_roll:
      "ZekerFlex Amsterdam kantoor/HQ, " +
      "Nederlandse vlag subtiel, " +
      "real people aan het werk, " +
      "geen corporate fake",
  },
];

// ============================================================================
// CALL-TO-ACTION (150-180+ seconden)
// ============================================================================

const ctaClips: ScriptClip[] = [
  {
    id: "cta-1",
    start: 150,
    duur: 5,
    soort: "spreker",
    sectie: "cta",
    spreker:
      "Je bent werker? Download de app. " +
      "Klaar in vijf minuten.",
    beschrijving: "App-logo verschijnt met download-link (Play Store, App Store)",
    noten: "Duidelijke CTA, easy win",
    b_roll:
      "App-store badges animeren in, " +
      "telefoon toont app",
  },
  {
    id: "cta-2",
    start: 155,
    duur: 5,
    soort: "spreker",
    sectie: "cta",
    spreker:
      "Bedrijf? Log in op www.zekerflex.com. " +
      "Eerste maand gratis.",
    beschrijving: "URL en 'gratis' badge in groot lettertype",
    noten: "Zakelijk, direct",
    b_roll: "Website-scherm, inloggen snelle flow, gratis badge",
  },
  {
    id: "cta-3",
    start: 160,
    duur: 20,
    soort: "spreker",
    sectie: "cta",
    spreker:
      "ZekerFlex. \n" +
      "Flexwerk, gedaan. " +
      "Geen BS. " +
      "Vertrouwen, ingebakken.",
    beschrijving:
      "Logo-finale met tagline-ondertitel, " +
      "fade to black",
    noten: "Krachtig slot, onvergetelijk",
    b_roll:
      "Montage van tevreden werkers en bedrijven die werkelijk werken, " +
      "logo eindigt met impact, " +
      "geluid en muziek pieken",
  },
];

// ============================================================================
// SAMENSTELLING
// ============================================================================

export const OPRICHTER_SCRIPT: OprichterScript = {
  titel: "ZekerFlex: Wie we zijn, waarom het uitmaakt",
  versie: "1.0",
  totaalDuur: 180, // 3 minuten
  taal: "nl",
  clips: [
    ...hookClips,
    ...problemClips,
    ...solutionClips,
    ...whyNowClips,
    ...ctaClips,
  ],
  muziek: {
    titel: "To be determined",
    artiestNaam: "To be determined",
    bpm: 120,
    mood: "Modern, urgent, hopeful. Dutch indie of tech startup vibe. NOT corporate.",
  },
  productieNoten: `
# ZekerFlex Oprichter-Video: Productiehulp

## Stijl & Toon
- **Authentiek.** Eigenaar spreekt zelf (of met gemak-verteller, maar REËEL).
- **Geen corporate BS.** Geen te gladde transitions, geen inspiratiekwotes.
- **Nederlands.** Deze video is VOOR Nederlandse media/investors.
- **Casual.** Jeans en T-shirt, werkplek of straat. Niet in pak.
- **Data > hype.** 500K werkers = echt getal. Timing is real.

## Visuele Guidance

### Hook (0-15s): Impact & Duidelijkheid
- Grafisch: Rood = chaos, groen = oplossing.
- Tempo: Begin snel. Pak aandacht.
- Spreker: Recht, intense blik. "Dit is geen marketing, dit is real."

### Problem (15-45s): Erkenning
- Laat echt platforms zien (verpixeld of gecaricatureerd).
- Grafiek: 500K stijgt, dan breekt af (mismatch).
- Gezichten: Frustratie, wacht, verwarring.
- Muziek: Licht onheilspellend, bouwt spanning op.

### Solution (45-120s): Hoop & Snelheid
- App-schermen: Schoon, duidelijk, Geen geklaag meer.
- Animatie: ID-scan, verificatie, groen vinkje = vertrouwen.
- Montage: Real app-screenshots van matching, gebruikers, prijs.
- Muziek: Opluchting, ritme omhoog. Hoop.

### Why Now (120-150s): Context & Visie
- Waarde: Nederland, lokaal, human.
- Visueel: Kantoor in NL, gezinnen, echte werkers.
- Spreker: Rustig. Dit is niet hype, dit is toekomst.

### CTA (150-180s): Action
- App-badges: Google Play, App Store.
- URL: www.zekerflex.com (groot, duidelijk).
- Finale: Logo met tagline, sterk slot.
- Muziek: Climax en release. Voelbaar einde.

## B-Roll & Bronnen

Waar kunnen we dit vinden?

1. **App-screenshots**: Uit de echte app (interne test-build of live).
2. **Chaos-boards**: Job-boards die slecht functioneren (verpixel ze voor veiligheid).
3. **Animaties**: Eigen klein team of budget tool (Doodly, Powtoon).
4. **Real footage**: Eigenaar op kantoor / straat / met werkers.
5. **Muziek**: Epidemic Sound, Artlist, of budget indie-artiest.

## Production Timeline

1. **Script**: Klaar (dit bestand).
2. **Voiceoverrecording**: 1 dag.
3. **B-roll collect**: Bestaande sources (app, screenshots, stock).
4. **Editing**: 3-5 dagen (DaVinci Resolve of Premiere).
5. **Review & tweaks**: 2 dagen.
6. **Upload & distribution**: 1 dag.

**Total: ~2 weken, budget-afhankelijk.**

## Audio Mix
- Voiceover: Duidelijk, geen achtergrond.
- Muziek: Begin zacht, climax naar finale.
- SFX: Minimaal (vinkje-geluid, transactie-ping, impactgeluid slot).
- Stille moments: Yes (kracht).

## Distribution
- YouTube-hoofd-kanaal (met transcript).
- LinkedIn (bedrijven).
- Instagram Reels (werkersapp).
- TikTok (indien relevant).
- Website homepage (embedded).

## Notes voor Eigenaar
- Spreek jezelf in. Authenticity wint van perfectie.
- Lach niet nerveus; dit is real.
- Pauzes zijn je vrienden.
- In eerste take: krijg je energie eruit, daarna edit.
`,
};

// ============================================================================
// HELPERS
// ============================================================================

/** Geeft totale duur van script in seconden */
export function scriptDuur(script: OprichterScript): number {
  return script.totaalDuur;
}

/** Sorteert clips op tijd */
export function clipsOpVolgorde(script: OprichterScript): ScriptClip[] {
  return [...script.clips].sort((a, b) => a.start - b.start);
}

/** Haalt clips van één sectie */
export function clipsBijSectie(
  script: OprichterScript,
  sectie: SectieType,
): ScriptClip[] {
  return script.clips.filter((c) => c.sectie === sectie);
}

/** Genereert een tekstueel outline van het script (voor teleprompter etc.) */
export function genererenOutline(script: OprichterScript): string {
  const sortedClips = clipsOpVolgorde(script);
  let outline =
    `# ${script.titel}\n\n` +
    `Totaal: ${script.totaalDuur} seconden (${Math.floor(script.totaalDuur / 60)}m ${script.totaalDuur % 60}s)\n\n`;

  let huidigeStart = 0;
  for (const clip of sortedClips) {
    if (clip.spreker) {
      const minuten = Math.floor(clip.start / 60);
      const seconden = clip.start % 60;
      outline += `**[${minuten}:${seconden.toString().padStart(2, "0")}]** ${clip.spreker}\n\n`;
    }
  }

  return outline;
}
