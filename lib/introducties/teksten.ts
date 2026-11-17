// De teksten van "Introduceer een bedrijf" (components/introductie/IntroductieFormulier.tsx), 17 nov 2026. Puur bestand: de
// Nederlandse standaard staat hier (ook de werkgeversapp, lib/i18n/dictionaries.ts); de andere talen in
// lib/introducties/teksten-talen.ts, gekoppeld aan lib/i18n/freelancer.ts (introductie) en dictionary-en.ts.
// {bedrag} = het bol-tegoed in euro's (BELONING_EURO); {velden}, {datum} vult het scherm in. De regels over de beloning
// (regelBeloning, kleineLetters, beloningUitleg) staan niet in de Android- en iPhone-app (lib/app-mode.ts).

export const INTRODUCTIE_NL = {
  /** BCP 47-tag voor datums */
  locale: "nl-NL",
  menu: "Introduceer een bedrijf",
  kaartSub: "Ken je een bedrijf dat flexwerkers kan gebruiken? Stel het aan ons voor.",
  titel: "Introduceer een bedrijf",
  uitleg: "Geef aan wie we mogen benaderen.",
  regelGratis: "Tijdens hun eerste twee weken betalen ze geen platformkosten.",
  regelBeloning: "Zodra zij hun eerste factuur betalen, ontvang je € {bedrag} bol-tegoed.",
  regelGegevens: "We gebruiken deze gegevens alleen voor deze introductie.",
  regelMens: "Een medewerker van ZekerFlex neemt zelf contact op. We sturen niets automatisch.",
  kleineLetters: "Eén beloning per bedrijf, voor wie het als eerste voorstelt. Een bedrijf dat al klant is, telt niet mee.",
  naam: "Naam contactpersoon",
  bedrijf: "Bedrijfsnaam",
  email: "E-mailadres",
  telefoon: "Telefoonnummer",
  contactHint: "Vul een e-mailadres of een telefoonnummer in, of allebei.",
  toestemming: "Deze persoon weet dat ZekerFlex contact opneemt",
  versturen: "Versturen",
  bezig: "Versturen…",
  bedankt: "Bedankt! Je introductie staat hieronder.",
  vulNogIn: "Vul nog in: {velden}.",
  velden: {
    contactNaam: "de naam van de contactpersoon",
    bedrijf: "de bedrijfsnaam",
    contact: "een e-mailadres of telefoonnummer",
    toestemming: "het vinkje dat deze persoon het weet",
  },
  ongeldig: {
    email: "Dit e-mailadres klopt niet.",
    telefoon: "Dit telefoonnummer klopt niet.",
    zelf: "Je kunt jezelf niet voorstellen.",
    dubbel: "Dit bedrijf heb je al voorgesteld.",
    vol: "Je hebt het maximale aantal introducties bereikt.",
  },
  teVaak: "Je hebt vandaag al veel bedrijven voorgesteld. Probeer het morgen opnieuw.",
  mislukt: "Versturen lukte niet. Probeer het opnieuw.",
  lijstTitel: "Jouw introducties",
  leeg: "Je hebt nog geen bedrijf voorgesteld.",
  ingediendOp: "Ingediend op {datum}",
  status: {
    ingediend: "Ingediend",
    benaderd: "Benaderd",
    klant: "Klant geworden",
    "beloning-onderweg": "Beloning onderweg",
    "beloning-verstuurd": "Beloning verstuurd",
    "al-klant": "Was al klant",
    eerder: "Al eerder voorgesteld",
    gestopt: "Geen klant geworden",
  },
  statusUitleg: {
    ingediend: "We nemen binnenkort contact met ze op.",
    benaderd: "We hebben contact met ze gezocht.",
    klant: "Ze werken nu met ZekerFlex.",
    "beloning-onderweg": "Hun eerste factuur is betaald. Je bol-tegoed komt eraan.",
    "beloning-verstuurd": "We hebben je bol-tegoed gestuurd.",
    "al-klant": "Dit bedrijf werkte al met ZekerFlex.",
    eerder: "Iemand anders stelde dit bedrijf eerder voor.",
    gestopt: "Het bedrijf gaat nu niet met ZekerFlex werken.",
  },
  /** alleen op de website: wat de stand betekent voor de beloning */
  beloningUitleg: {
    klant: "Je € {bedrag} bol-tegoed volgt zodra hun eerste factuur betaald is.",
    "al-klant": "Daarom telt deze introductie niet mee voor de beloning.",
    eerder: "De beloning gaat naar wie het als eerste voorstelde.",
  },
};

export type IntroductieTeksten = typeof INTRODUCTIE_NL;
