// De uitgebreide opmaak van een aanbodpagina (15 nov 2026, eigenaar: "ik wil de weergave zoals bij de prikklok van TimeChimp"):
// een lichte kop met kruimelpad en echte schermafbeeldingen, dan afwisselend beeld en tekst (wat het is, voordelen, hoe het werkt),
// kaarten met andere functies en een afsluitend blok. Een aanbodpagina zonder item hier houdt de gewone opmaak. Alles wat
// hier staat bestaat echt (lib/checkin/, lib/incheck/); geen verzonnen aantallen of klanten. Puur: geen prisma of kv.

/** Een echte schermafbeelding in public/aanbod (gemaakt in een tijdelijk testbedrijf met voorbeeldgegevens en daarna opgeruimd). */
export interface Beeld {
  bestand: string;
  breed: number;
  hoog: number;
  alt: string;
}

export interface Uitgebreid {
  /** het blok onder de kop: foto met een zwevende kaart, tekst en een knop */
  intro: { kop: string; alinea: string[]; knop: string };
  voordelen: { kop: string; intro: string; punten: string[]; knop: string };
  hoe: { kop: string; alinea: string[]; knop: string };
  /** de echte schermen op de pagina: het tabletscherm bij de ingang en het beheer van de terminals */
  beelden: { tablet: Beeld; beheer: Beeld };
  foto: { bestand: string; alt: string };
  /** slugs van andere aanbodpagina's voor de kaarten onderaan */
  andere: [string, string, string];
  slot: { kop: string; checks: [string, string, string] };
}

export const UITGEBREID: Record<string, Uitgebreid> = {
  "automatisch-inchecken": {
    intro: {
      kop: "Automatisch inchecken maakt urenregistratie makkelijk",
      alinea: [
        "Hang een QR-poster of een Bluetooth-baken bij de ingang, of gebruik alleen de geofence van je vestiging. De telefoon van de kracht merkt dat hij op de werkplek is en checkt in; bij vertrek checkt hij uit. Je hebt geen dure hardware en geen app-winkel nodig.",
        "Geen gps-stuiters: een kracht wordt pas ingecheckt na twee metingen binnen de afstand en uitgecheckt na vijf minuten buiten. Zo ontstaan er geen uren doordat een telefoon even verspringt.",
        "Liever een vaste plek? Zet een tablet bij de ingang: krachten checken in met een QR-code die elke minuut wisselt, met een NFC-sticker of met een sleutelhanger.",
      ],
      knop: "Probeer gratis",
    },
    voordelen: {
      kop: "Voordelen van automatisch inchecken",
      intro: "Automatisch inchecken scheelt handwerk en voorkomt discussie over uren. De voordelen:",
      punten: ["Eenvoudig en snel inchecken", "Geen gps-stuiters door meerdere metingen", "Het bewijs staat bij elk urenbriefje", "Geen speciale hardware nodig"],
      knop: "Vrijblijvend proberen",
    },
    hoe: {
      kop: "Hoe werkt automatisch inchecken?",
      alinea: [
        "Voor een locatie kies je hoe krachten inchecken: automatisch via de geofence van je vestiging, met een QR-poster, met een Bluetooth-baken of met de tablet bij de ingang. De kracht komt aan en zijn aankomst wordt vastgelegd; bij vertrek wordt hij uitgecheckt.",
        "De uren staan daarna klaar om goed te keuren. Bij elk urenbriefje zie je hoe er is ingecheckt en hoe laat, zodat je niet hoeft te vragen of te schatten.",
      ],
      knop: "Probeer gratis",
    },
    beelden: {
      tablet: { bestand: "incheck-tablet.webp", breed: 900, hoog: 927, alt: "Het tabletscherm bij de ingang met de QR-code om in te checken" },
      beheer: { bestand: "incheck-beheer.webp", breed: 1400, hoog: 414, alt: "Het beheer van inchecken op locatie met QR op het scherm, NFC-sticker en sleutelhanger" },
    },
    foto: { bestand: "inchecken-op-locatie.jpg", alt: "Een werker checkt in met een tablet bij de ingang" },
    andere: ["inchecken-op-locatie", "roosterplanner", "flexwerkers-inhuren"],
    slot: { kop: "Probeer ZekerFlex gratis", checks: ["Een account aanmaken kost niets", "Inbegrepen bij flexwerkers inhuren", "Eén login voor alles"] },
  },
};

export const uitgebreidVan = (slug: string): Uitgebreid | undefined => (Object.hasOwn(UITGEBREID, slug) ? UITGEBREID[slug] : undefined);
