import { STANDAARD, groepFout, inVenster, isDatum, isTijd, openOp, slotFout, tijdsloten, type AgendaConfig, type BezetteTijd } from "@/lib/voorstel/schwarzwald-agenda";

// Regels voor de wachtlijst van een vol tijdslot. Puur, los te testen.
// Er gaat geen mail uit: of er weer plek is, wordt live uitgerekend met
// dezelfde slotFout() als bij boeken (Mijn account en het beheer tonen het).

export interface WachtSlot {
  activiteit: string;
  datum: string;
  tijd: string;
  personen: number;
}

/** Waarom deze gast (nog) niet op de wachtlijst kan, of null als het kan. */
export function wachtlijstFout(w: WachtSlot, vandaag: string, bezet: BezetteTijd[], cfg: AgendaConfig = STANDAARD): string | null {
  if (!isDatum(w.datum) || !isTijd(w.tijd)) return "Kies een geldige datum en tijd.";
  if (!inVenster(w.datum, vandaag)) return "Deze datum is niet (meer) te boeken.";
  const groep = groepFout(w.activiteit, w.personen, cfg);
  if (groep) return groep;
  if (!openOp(w.datum, w.personen, cfg)) return "Op deze dag zijn we gesloten.";
  const slot = tijdsloten(w.activiteit, w.datum, w.personen, bezet, cfg).find((s) => s.tijd === w.tijd);
  if (!slot) return "Op dit tijdstip kan deze activiteit niet beginnen.";
  if (slot.status !== "vol") return "Er is nog plek op dit tijdstip: je kunt gewoon boeken.";
  return null;
}

/** Is er voor deze wachtende groep inmiddels weer plek? */
export const plekVrij = (w: WachtSlot, bezet: BezetteTijd[], cfg: AgendaConfig = STANDAARD) => slotFout(w.activiteit, w.datum, w.tijd, w.personen, bezet, cfg) === null;
