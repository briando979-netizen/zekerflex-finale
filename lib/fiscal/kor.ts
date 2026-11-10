// ---------------------------------------------------------------------------
// KOR-hulp (10 nov 2026, op verzoek van de eigenaar): een werker zonder
// kleineondernemersregeling kan hem via ZekerFlex voorbereiden. Indienen kan
// alleen de werker zelf, met DigiD in Mijn Belastingdienst Zakelijk (formulier
// "Melding omzetbelasting kleineondernemersregeling"); ZekerFlex mag dat niet
// namens hem. Regels van de Belastingdienst (belastingdienst.nl/kleineondernemersregeling):
//  - omzet hoogstens € 20.000 in het kalenderjaar van aanmelden én het jaar ervoor;
//  - de melding moet uiterlijk 4 weken vóór het begin van het aangiftetijdvak
//    (kwartaal) binnen zijn; de KOR geldt vanaf dat kwartaal;
//  - de KOR geldt pas na de schriftelijke bevestiging van de Belastingdienst.
// Daarom zet ZekerFlex "KOR" pas aan als een medewerker die bevestiging zag.
// Puur bestand: ook bruikbaar in het scherm (components/app/KorHulp.tsx).
// ---------------------------------------------------------------------------

/** Omzetgrens per kalenderjaar, in centen. */
export const KOR_GRENS_CENT = 2_000_000;

/** Dagen dat de melding vóór het begin van het kwartaal binnen moet zijn. */
export const KOR_MELDTERMIJN_DAGEN = 28;

export type KorStand = "ingediend" | "bevestigd";

export interface KorAanvraag {
  stand: KorStand;
  /** yyyy-mm-dd: het kwartaal waarop de KOR ingaat */
  ingang: string;
  /** ISO-tijd waarop de werker zei dat hij de melding indiende */
  ingediendOp: string;
  omzetDitJaarCent: number;
  omzetVorigJaarCent: number;
}

function dagKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Het eerste kwartaal waarvoor de melding nog op tijd is, gerekend vanaf `vandaag`
 * (yyyy-mm-dd, Nederlandse dag): de ingangsdatum en de laatste dag om in te dienen.
 */
export function korIngang(vandaag: string): { ingang: string; uiterlijk: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(vandaag);
  if (!m) throw new Error("ongeldige dag");
  const jaar = Number(m[1]);
  const maand = Number(m[2]) - 1;
  const nu = Date.UTC(jaar, maand, Number(m[3]));
  // het volgende kwartaal, dan zo nodig het kwartaal daarna
  let kwartaalMaand = Math.floor(maand / 3) * 3 + 3;
  for (let i = 0; i < 3; i++) {
    const start = Date.UTC(jaar, kwartaalMaand, 1);
    const uiterlijk = start - KOR_MELDTERMIJN_DAGEN * 86_400_000;
    if (nu <= uiterlijk) return { ingang: dagKey(start), uiterlijk: dagKey(uiterlijk) };
    kwartaalMaand += 3;
  }
  // onbereikbaar: na twee kwartalen is er altijd ruim vier weken
  const start = Date.UTC(jaar, kwartaalMaand, 1);
  return { ingang: dagKey(start), uiterlijk: dagKey(start - KOR_MELDTERMIJN_DAGEN * 86_400_000) };
}

/** Past de omzet binnen de KOR (dit jaar én vorig jaar)? */
export function korBinnenGrens(omzetDitJaarCent: number, omzetVorigJaarCent: number): boolean {
  return omzetDitJaarCent >= 0 && omzetVorigJaarCent >= 0 && omzetDitJaarCent <= KOR_GRENS_CENT && omzetVorigJaarCent <= KOR_GRENS_CENT;
}

/** "1234,56" / "1.234" / "1234" (euro's) → centen; null als het geen bedrag is. */
export function euroNaarCent(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/[€\s]/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100);
}

/** Notitie bij een geüpload document: de bevestiging van de Belastingdienst (lib/compliance/documents.ts). */
export const KOR_BEVESTIGING = "kor-bevestiging";

/** De officiële pagina met het formulier (geen diepe link: die verandert soms). */
export const KOR_BELASTINGDIENST_URL = "https://www.belastingdienst.nl/kleineondernemersregeling";
