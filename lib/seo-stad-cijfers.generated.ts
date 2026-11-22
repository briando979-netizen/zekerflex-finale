// AUTO-GEGENEREERD door scripts/stad-cijfers.mjs — niet met de hand bewerken.
// Opnieuw draaien als het CBS nieuwe cijfers heeft: node scripts/stad-cijfers.mjs
//
// Feitelijke cijfers per stad voor de stadspagina's (lib/seo-stad.ts), uit CBS StatLine (open data, CC BY 4.0).
// Per cijfer: de waarde (n), de CBS-tabel en het peiljaar (stand op 1 januari van dat jaar). "voorlopig" volgt de
// status van die periode bij het CBS. De gemeente en het COROP-gebied komen uit "Gebieden in Nederland" (86247NED).

export interface Cijfer {
  /** de waarde */
  n: number;
  /** de tabel bij het CBS (StatLine) */
  tabel: string;
  /** peiljaar: de stand op 1 januari van dit jaar */
  jaar: number;
  /** het CBS noemt het cijfer van dit jaar nog voorlopig */
  voorlopig: boolean;
}

/** Vestigingen per gemeente, naar bedrijfstak (SBI 2008, secties). */
export interface GemeenteVestigingen {
  /** alle bedrijfstakken (A-U) */
  totaal: Cijfer;
  /** G Handel (groot- en detailhandel, autohandel) */
  handel: Cijfer;
  /** H Vervoer en opslag */
  vervoer: Cijfer;
  /** I Horeca */
  horeca: Cijfer;
  /** N Verhuur en overige zakelijke diensten (o.a. schoonmaak, uitzendbureaus, beveiliging) */
  zakelijk: Cijfer;
  /** R Cultuur, sport en recreatie */
  cultuur: Cijfer;
}

/** Vestigingen per COROP-gebied, fijnere bedrijfstakken (die heeft het CBS niet per gemeente). */
export interface RegioVestigingen {
  /** 47 Detailhandel (niet in auto's) */
  detailhandel: Cijfer;
  /** 52 Opslag, dienstverlening voor vervoer */
  opslag: Cijfer;
  /** 53 Post en koeriers */
  koeriers: Cijfer;
  /** 812 Schoonmaakbedrijven */
  schoonmaak: Cijfer;
  /** 73 Reclamewezen en marktonderzoek */
  reclame: Cijfer;
}

export interface StadCijfers {
  /** de gemeente bij het CBS (kan groter zijn dan de plaats: Hoogezand-Sappemeer valt onder Midden-Groningen) */
  gemeente: string;
  gemeenteCode: string;
  /** het COROP-gebied waar de gemeente in ligt */
  corop: string;
  coropCode: string;
  /** stedelijkheid van de gemeente volgens het CBS ("zeer sterk stedelijk" … "niet stedelijk") */
  stedelijkheid: string;
  /** inwoners van de gemeente */
  inwoners: Cijfer;
  /** inwoners van 18 tot en met 24 jaar */
  jongeren: Cijfer;
  vestigingen: GemeenteVestigingen;
  /** dezelfde vestigingen een jaar eerder */
  vestigingenVorig: GemeenteVestigingen;
  /** cijfers van het COROP-gebied */
  regio: RegioVestigingen;
}

export interface CbsTabel {
  titel: string;
  jaar: number;
  voorlopig: boolean;
}

export const CBS_TABELLEN: Record<string, CbsTabel> = {
  "03759ned": {
    titel: "Bevolking op 1 januari en gemiddeld; geslacht, leeftijd en regio",
    jaar: 2026,
    voorlopig: false,
  },
  "81575NED": {
    titel: "Vestigingen van bedrijven; bedrijfstak, gemeente",
    jaar: 2026,
    voorlopig: true,
  },
  "81578NED": {
    titel: "Vestigingen van bedrijven; bedrijfstak, regio",
    jaar: 2026,
    voorlopig: true,
  },
  "86247NED": {
    titel: "Gebieden in Nederland 2026",
    jaar: 2026,
    voorlopig: false,
  },
};

/** Heel Nederland, om een stad mee te vergelijken. */
export const NEDERLAND_CIJFERS: Pick<StadCijfers, "inwoners" | "jongeren" | "vestigingen" | "vestigingenVorig" | "regio"> = {
  inwoners: { n: 18130208, tabel: "03759ned", jaar: 2026, voorlopig: false },
  jongeren: { n: 1601604, tabel: "03759ned", jaar: 2026, voorlopig: false },
  vestigingen: {
    totaal: { n: 2612500, tabel: "81575NED", jaar: 2026, voorlopig: true },
    handel: { n: 337400, tabel: "81575NED", jaar: 2026, voorlopig: true },
    vervoer: { n: 73625, tabel: "81575NED", jaar: 2026, voorlopig: true },
    horeca: { n: 90290, tabel: "81575NED", jaar: 2026, voorlopig: true },
    zakelijk: { n: 140295, tabel: "81575NED", jaar: 2026, voorlopig: true },
    cultuur: { n: 145345, tabel: "81575NED", jaar: 2026, voorlopig: true },
  },
  vestigingenVorig: {
    totaal: { n: 2551540, tabel: "81575NED", jaar: 2025, voorlopig: true },
    handel: { n: 330530, tabel: "81575NED", jaar: 2025, voorlopig: true },
    vervoer: { n: 72485, tabel: "81575NED", jaar: 2025, voorlopig: true },
    horeca: { n: 88700, tabel: "81575NED", jaar: 2025, voorlopig: true },
    zakelijk: { n: 137985, tabel: "81575NED", jaar: 2025, voorlopig: true },
    cultuur: { n: 141655, tabel: "81575NED", jaar: 2025, voorlopig: true },
  },
  regio: {
    detailhandel: { n: 206250, tabel: "81578NED", jaar: 2026, voorlopig: true },
    opslag: { n: 17825, tabel: "81578NED", jaar: 2026, voorlopig: true },
    koeriers: { n: 9155, tabel: "81578NED", jaar: 2026, voorlopig: true },
    schoonmaak: { n: 27915, tabel: "81578NED", jaar: 2026, voorlopig: true },
    reclame: { n: 30895, tabel: "81578NED", jaar: 2026, voorlopig: true },
  },
};

export const STAD_CIJFERS: Record<string, StadCijfers> = {
  amsterdam: {
    gemeente: "Amsterdam",
    gemeenteCode: "GM0363",
    corop: "Groot-Amsterdam",
    coropCode: "CR23",
    stedelijkheid: "zeer sterk stedelijk",
    inwoners: { n: 941927, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 98541, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 216360, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 20175, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 9445, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 11805, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 12230, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 23585, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 209480, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 19570, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 9240, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 11560, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 11825, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 23210, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 21175, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 2015, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 1335, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 3505, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 5550, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  rotterdam: {
    gemeente: "Rotterdam",
    gemeenteCode: "GM0599",
    corop: "Groot-Rijnmond",
    coropCode: "CR29",
    stedelijkheid: "zeer sterk stedelijk",
    inwoners: { n: 673804, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 70189, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 110815, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 12835, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 5085, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 4210, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 7095, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 7775, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 109565, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 12415, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 5070, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 4185, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 7215, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 7650, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 17870, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 3320, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 950, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 2930, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 2350, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  "den-haag": {
    gemeente: "'s-Gravenhage",
    gemeenteCode: "GM0518",
    corop: "Agglomeratie 's-Gravenhage",
    coropCode: "CR26",
    stedelijkheid: "zeer sterk stedelijk",
    inwoners: { n: 569468, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 55168, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 101385, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 9160, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 2940, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 3585, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 6200, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 5730, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 100760, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 9090, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 2935, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 3555, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 6375, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 5600, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 10230, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 870, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 485, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 2415, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 1425, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  utrecht: {
    gemeente: "Utrecht",
    gemeenteCode: "GM0344",
    corop: "Utrecht",
    coropCode: "CR17",
    stedelijkheid: "zeer sterk stedelijk",
    inwoners: { n: 378121, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 45832, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 64365, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 5770, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 1685, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 2460, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 3525, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 6100, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 62990, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 5600, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 1670, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 2415, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 3410, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 6025, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 15450, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 965, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 890, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 2135, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 2890, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  eindhoven: {
    gemeente: "Eindhoven",
    gemeenteCode: "GM0772",
    corop: "Zuidoost-Noord-Brabant",
    coropCode: "CR36",
    stedelijkheid: "zeer sterk stedelijk",
    inwoners: { n: 249783, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 29119, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 34670, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 4555, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 1010, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 1385, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 1920, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 2040, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 33545, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 4505, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 1025, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 1330, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 1865, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 1970, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 8920, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 520, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 515, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 1195, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 1335, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  groningen: {
    gemeente: "Groningen",
    gemeenteCode: "GM0014",
    corop: "Overig Groningen",
    coropCode: "CR03",
    stedelijkheid: "zeer sterk stedelijk",
    inwoners: { n: 244427, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 46172, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 32545, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 3765, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 550, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 1335, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 1740, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 3115, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 31695, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 3715, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 560, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 1330, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 1700, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 3025, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 4410, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 270, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 115, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 450, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 730, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  tilburg: {
    gemeente: "Tilburg",
    gemeenteCode: "GM0855",
    corop: "Midden-Noord-Brabant",
    coropCode: "CR34",
    stedelijkheid: "zeer sterk stedelijk",
    inwoners: { n: 230746, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 27255, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 29310, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 4030, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 860, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 960, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 1550, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 2285, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 28760, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 3980, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 850, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 935, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 1560, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 2215, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 5680, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 480, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 255, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 710, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 770, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  almere: {
    gemeente: "Almere",
    gemeenteCode: "GM0034",
    corop: "Flevoland",
    coropCode: "CR40",
    stedelijkheid: "sterk stedelijk",
    inwoners: { n: 232619, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 19790, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 33365, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 4520, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 1415, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 1125, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 2595, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 1495, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 32760, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 4375, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 1370, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 1100, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 2565, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 1440, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 5720, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 480, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 345, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 935, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 590, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  breda: {
    gemeente: "Breda",
    gemeenteCode: "GM0758",
    corop: "West-Noord-Brabant",
    coropCode: "CR33",
    stedelijkheid: "sterk stedelijk",
    inwoners: { n: 190204, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 19512, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 30280, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 4025, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 785, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 985, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 1585, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 1665, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 29330, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 3925, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 785, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 965, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 1550, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 1645, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 7580, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 785, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 440, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 955, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 1075, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  nijmegen: {
    gemeente: "Nijmegen",
    gemeenteCode: "GM0268",
    corop: "Arnhem/Nijmegen",
    coropCode: "CR15",
    stedelijkheid: "sterk stedelijk",
    inwoners: { n: 189871, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 27082, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 25190, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 2755, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 460, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 925, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 1270, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 1940, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 24710, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 2745, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 460, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 920, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 1230, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 1885, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 8010, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 495, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 340, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 845, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 1170, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  apeldoorn: {
    gemeente: "Apeldoorn",
    gemeenteCode: "GM0200",
    corop: "Veluwe",
    coropCode: "CR13",
    stedelijkheid: "sterk stedelijk",
    inwoners: { n: 169212, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 13472, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 22470, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 3310, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 490, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 750, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 1365, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 1080, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 22030, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 3210, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 475, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 745, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 1370, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 1040, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 8060, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 420, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 305, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 865, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 985, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  haarlem: {
    gemeente: "Haarlem",
    gemeenteCode: "GM0392",
    corop: "Agglomeratie Haarlem",
    coropCode: "CR21",
    stedelijkheid: "zeer sterk stedelijk",
    inwoners: { n: 168898, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 12195, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 29515, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 2925, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 915, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 1125, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 1565, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 2220, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 28865, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 2905, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 910, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 1125, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 1575, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 2170, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 2775, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 180, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 115, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 460, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 825, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  arnhem: {
    gemeente: "Arnhem",
    gemeenteCode: "GM0202",
    corop: "Arnhem/Nijmegen",
    coropCode: "CR15",
    stedelijkheid: "sterk stedelijk",
    inwoners: { n: 171822, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 16826, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 25975, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 2810, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 530, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 885, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 1400, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 2085, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 25615, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 2770, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 520, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 855, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 1395, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 2040, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 8010, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 495, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 340, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 845, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 1170, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  enschede: {
    gemeente: "Enschede",
    gemeenteCode: "GM0153",
    corop: "Twente",
    coropCode: "CR12",
    stedelijkheid: "sterk stedelijk",
    inwoners: { n: 162683, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 20657, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 18425, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 3225, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 315, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 660, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 865, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 1105, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 17985, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 3155, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 320, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 640, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 835, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 1050, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 7775, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 345, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 225, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 510, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 790, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  amersfoort: {
    gemeente: "Amersfoort",
    gemeenteCode: "GM0307",
    corop: "Utrecht",
    coropCode: "CR17",
    stedelijkheid: "sterk stedelijk",
    inwoners: { n: 163764, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 13324, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 25335, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 2735, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 480, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 760, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 1350, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 1585, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 24875, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 2680, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 480, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 745, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 1315, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 1560, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 15450, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 965, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 890, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 2135, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 2890, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  zaanstad: {
    gemeente: "Zaanstad",
    gemeenteCode: "GM0479",
    corop: "Zaanstreek",
    coropCode: "CR22",
    stedelijkheid: "sterk stedelijk",
    inwoners: { n: 165201, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 13517, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 23695, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 2740, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 1280, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 780, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 1815, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 1300, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 23165, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 2690, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 1190, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 750, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 1830, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 1280, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 1995, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 220, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 160, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 705, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 320, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  "den-bosch": {
    gemeente: "'s-Hertogenbosch",
    gemeenteCode: "GM0796",
    corop: "Noordoost-Noord-Brabant",
    coropCode: "CR35",
    stedelijkheid: "sterk stedelijk",
    inwoners: { n: 162295, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 13275, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 26780, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 3305, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 470, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 885, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 1365, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 1525, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 26365, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 3290, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 475, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 880, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 1370, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 1515, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 7525, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 485, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 290, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 830, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 1205, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  zwolle: {
    gemeente: "Zwolle",
    gemeenteCode: "GM0193",
    corop: "Noord-Overijssel",
    coropCode: "CR10",
    stedelijkheid: "sterk stedelijk",
    inwoners: { n: 134147, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 12367, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 18240, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 2330, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 395, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 580, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 965, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 1425, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 17790, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 2350, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 390, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 560, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 940, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 1395, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 4285, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 230, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 155, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 365, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 510, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  leiden: {
    gemeente: "Leiden",
    gemeenteCode: "GM0546",
    corop: "Agglomeratie Leiden en Bollenstreek",
    coropCode: "CR25",
    stedelijkheid: "zeer sterk stedelijk",
    inwoners: { n: 130328, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 20055, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 17660, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 1810, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 405, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 780, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 1000, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 1360, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 17215, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 1750, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 395, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 785, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 995, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 1325, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 4575, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 375, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 145, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 750, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 740, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  veendam: {
    gemeente: "Veendam",
    gemeenteCode: "GM0047",
    corop: "Oost-Groningen",
    coropCode: "CR01",
    stedelijkheid: "matig stedelijk",
    inwoners: { n: 27825, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 2166, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 2720, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 465, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 75, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 85, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 110, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 125, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 2655, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 455, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 60, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 90, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 115, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 120, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 1530, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 70, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 30, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 140, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 125, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  hoogezand: {
    gemeente: "Midden-Groningen",
    gemeenteCode: "GM1952",
    corop: "Overig Groningen",
    coropCode: "CR03",
    stedelijkheid: "weinig stedelijk",
    inwoners: { n: 61346, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 4513, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 6675, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 990, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 175, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 175, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 335, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 295, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 6565, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 1000, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 170, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 175, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 335, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 290, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 4410, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 270, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 115, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 450, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 730, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  winschoten: {
    gemeente: "Oldambt",
    gemeenteCode: "GM1895",
    corop: "Oost-Groningen",
    coropCode: "CR01",
    stedelijkheid: "weinig stedelijk",
    inwoners: { n: 39746, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 3036, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 4080, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 735, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 95, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 160, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 190, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 175, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 3965, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 725, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 95, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 150, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 180, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 155, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 1530, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 70, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 30, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 140, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 125, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  stadskanaal: {
    gemeente: "Stadskanaal",
    gemeenteCode: "GM0037",
    corop: "Oost-Groningen",
    coropCode: "CR01",
    stedelijkheid: "weinig stedelijk",
    inwoners: { n: 32110, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 2456, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 3315, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 600, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 65, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 90, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 165, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 120, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 3265, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 595, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 70, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 90, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 170, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 110, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 1530, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 70, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 30, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 140, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 125, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  assen: {
    gemeente: "Assen",
    gemeenteCode: "GM0106",
    corop: "Noord-Drenthe",
    coropCode: "CR07",
    stedelijkheid: "sterk stedelijk",
    inwoners: { n: 70769, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 6047, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 7225, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 1200, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 135, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 205, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 390, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 385, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 7075, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 1150, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 135, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 210, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 390, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 360, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 2005, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 105, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 75, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 130, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 235, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
  maastricht: {
    gemeente: "Maastricht",
    gemeenteCode: "GM0935",
    corop: "Zuid-Limburg",
    coropCode: "CR39",
    stedelijkheid: "zeer sterk stedelijk",
    inwoners: { n: 126026, tabel: "03759ned", jaar: 2026, voorlopig: false },
    jongeren: { n: 23475, tabel: "03759ned", jaar: 2026, voorlopig: false },
    vestigingen: {
      totaal: { n: 15065, tabel: "81575NED", jaar: 2026, voorlopig: true },
      handel: { n: 2100, tabel: "81575NED", jaar: 2026, voorlopig: true },
      vervoer: { n: 340, tabel: "81575NED", jaar: 2026, voorlopig: true },
      horeca: { n: 930, tabel: "81575NED", jaar: 2026, voorlopig: true },
      zakelijk: { n: 725, tabel: "81575NED", jaar: 2026, voorlopig: true },
      cultuur: { n: 1175, tabel: "81575NED", jaar: 2026, voorlopig: true },
    },
    vestigingenVorig: {
      totaal: { n: 14555, tabel: "81575NED", jaar: 2025, voorlopig: true },
      handel: { n: 2095, tabel: "81575NED", jaar: 2025, voorlopig: true },
      vervoer: { n: 330, tabel: "81575NED", jaar: 2025, voorlopig: true },
      horeca: { n: 895, tabel: "81575NED", jaar: 2025, voorlopig: true },
      zakelijk: { n: 700, tabel: "81575NED", jaar: 2025, voorlopig: true },
      cultuur: { n: 1150, tabel: "81575NED", jaar: 2025, voorlopig: true },
    },
    regio: {
      detailhandel: { n: 6215, tabel: "81578NED", jaar: 2026, voorlopig: true },
      opslag: { n: 345, tabel: "81578NED", jaar: 2026, voorlopig: true },
      koeriers: { n: 265, tabel: "81578NED", jaar: 2026, voorlopig: true },
      schoonmaak: { n: 720, tabel: "81578NED", jaar: 2026, voorlopig: true },
      reclame: { n: 660, tabel: "81578NED", jaar: 2026, voorlopig: true },
    },
  },
};
