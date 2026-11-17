// GEMAAKT door scripts/cbs-vestigingen.mjs op 2026-11-16 — niet met de hand aanpassen; draai het script opnieuw.
// Bron: CBS StatLine, tabel 81575NED "Vestigingen van bedrijven; bedrijfstak, gemeente" (open data). Stand op 1 januari van "jaar".

export interface CbsVestigingen {
  gemeente: string;
  code: string;
  /** alle bedrijfsvestigingen (A-U) */
  totaal: number;
  /** I Horeca */
  horeca: number;
  /** H Vervoer en opslag */
  vervoer: number;
  /** G Handel (winkels, groothandel en autohandel) */
  handel: number;
  /** R Cultuur, sport en recreatie */
  cultuur: number;
  jaar: number;
}

export const CBS_BRON = "https://opendata.cbs.nl/statline/#/CBS/nl/dataset/81575NED/table";

export const CBS_VESTIGINGEN: Record<string, CbsVestigingen> = {
  amsterdam: { gemeente: "Amsterdam", code: "GM0363", handel: 20175, vervoer: 9445, horeca: 11805, cultuur: 23585, totaal: 216360, jaar: 2026 },
  rotterdam: { gemeente: "Rotterdam", code: "GM0599", handel: 12835, vervoer: 5085, horeca: 4210, cultuur: 7775, totaal: 110815, jaar: 2026 },
  "den-haag": { gemeente: "Den Haag", code: "GM0518", handel: 9160, vervoer: 2940, horeca: 3585, cultuur: 5730, totaal: 101385, jaar: 2026 },
  utrecht: { gemeente: "Utrecht", code: "GM0344", handel: 5770, vervoer: 1685, horeca: 2460, cultuur: 6100, totaal: 64365, jaar: 2026 },
  eindhoven: { gemeente: "Eindhoven", code: "GM0772", handel: 4555, vervoer: 1010, horeca: 1385, cultuur: 2040, totaal: 34670, jaar: 2026 },
  groningen: { gemeente: "Groningen", code: "GM0014", handel: 3765, vervoer: 550, horeca: 1335, cultuur: 3115, totaal: 32545, jaar: 2026 },
  tilburg: { gemeente: "Tilburg", code: "GM0855", handel: 4030, vervoer: 860, horeca: 960, cultuur: 2285, totaal: 29310, jaar: 2026 },
  almere: { gemeente: "Almere", code: "GM0034", handel: 4520, vervoer: 1415, horeca: 1125, cultuur: 1495, totaal: 33365, jaar: 2026 },
  breda: { gemeente: "Breda", code: "GM0758", handel: 4025, vervoer: 785, horeca: 985, cultuur: 1665, totaal: 30280, jaar: 2026 },
  nijmegen: { gemeente: "Nijmegen", code: "GM0268", handel: 2755, vervoer: 460, horeca: 925, cultuur: 1940, totaal: 25190, jaar: 2026 },
  apeldoorn: { gemeente: "Apeldoorn", code: "GM0200", handel: 3310, vervoer: 490, horeca: 750, cultuur: 1080, totaal: 22470, jaar: 2026 },
  haarlem: { gemeente: "Haarlem", code: "GM0392", handel: 2925, vervoer: 915, horeca: 1125, cultuur: 2220, totaal: 29515, jaar: 2026 },
  arnhem: { gemeente: "Arnhem", code: "GM0202", handel: 2810, vervoer: 530, horeca: 885, cultuur: 2085, totaal: 25975, jaar: 2026 },
  enschede: { gemeente: "Enschede", code: "GM0153", handel: 3225, vervoer: 315, horeca: 660, cultuur: 1105, totaal: 18425, jaar: 2026 },
  amersfoort: { gemeente: "Amersfoort", code: "GM0307", handel: 2735, vervoer: 480, horeca: 760, cultuur: 1585, totaal: 25335, jaar: 2026 },
  zaanstad: { gemeente: "Zaanstad", code: "GM0479", handel: 2740, vervoer: 1280, horeca: 780, cultuur: 1300, totaal: 23695, jaar: 2026 },
  "den-bosch": { gemeente: "'s-Hertogenbosch", code: "GM0796", handel: 3305, vervoer: 470, horeca: 885, cultuur: 1525, totaal: 26780, jaar: 2026 },
  zwolle: { gemeente: "Zwolle", code: "GM0193", handel: 2330, vervoer: 395, horeca: 580, cultuur: 1425, totaal: 18240, jaar: 2026 },
  leiden: { gemeente: "Leiden", code: "GM0546", handel: 1810, vervoer: 405, horeca: 780, cultuur: 1360, totaal: 17660, jaar: 2026 },
  veendam: { gemeente: "Veendam", code: "GM0047", handel: 465, vervoer: 75, horeca: 85, cultuur: 125, totaal: 2720, jaar: 2026 },
  hoogezand: { gemeente: "Midden-Groningen", code: "GM1952", handel: 990, vervoer: 175, horeca: 175, cultuur: 295, totaal: 6675, jaar: 2026 },
  winschoten: { gemeente: "Oldambt", code: "GM1895", handel: 735, vervoer: 95, horeca: 160, cultuur: 175, totaal: 4080, jaar: 2026 },
  stadskanaal: { gemeente: "Stadskanaal", code: "GM0037", handel: 600, vervoer: 65, horeca: 90, cultuur: 120, totaal: 3315, jaar: 2026 },
  assen: { gemeente: "Assen", code: "GM0106", handel: 1200, vervoer: 135, horeca: 205, cultuur: 385, totaal: 7225, jaar: 2026 },
  maastricht: { gemeente: "Maastricht", code: "GM0935", handel: 2100, vervoer: 340, horeca: 930, cultuur: 1175, totaal: 15065, jaar: 2026 },
};
