// ---------------------------------------------------------------------------
// Takenlijsten in de horeca: openen, sluiten, dagelijks en wekelijks. Een taak
// kan een meting vragen (temperatuur) met een grens; een waarde buiten de
// grens geeft een waarschuwing. Zo ontstaat vanzelf een registratie voor de
// voedselveiligheid (HACCP). Een taak schrijf je als gewone regel tekst:
// "Koelcel temperatuur (max 7)" wordt een meting met maximum 7.
// Puur, dus ook in de browser bruikbaar en los te testen.
// ---------------------------------------------------------------------------

export const MOMENTEN = ["opening", "sluiting", "dagelijks", "wekelijks"] as const;
export type Moment = (typeof MOMENTEN)[number];
export const MOMENT_LABEL: Record<Moment, string> = { opening: "Bij opening", sluiting: "Bij sluiting", dagelijks: "Dagelijks", wekelijks: "Wekelijks" };

export const MAX_TAKEN = 40;

export interface Taak {
  tekst: string;
  /** vraagt een gemeten waarde (bijvoorbeeld temperatuur in °C) */
  meten: boolean;
  min?: number;
  max?: number;
}

const getal = (s: string) => Number(s.replace(",", "."));

/** "Koelcel temperatuur (max 7)", "Vriezer (min -25 max -18)" of "Werkbank schoon". */
export function leesRegel(regel: string): Taak | null {
  const tekst = regel.trim().replace(/\s+/g, " ").slice(0, 140);
  if (!tekst) return null;
  const m = tekst.match(/\((?:\s*min\s*(-?\d+(?:[.,]\d+)?))?\s*(?:max\s*(-?\d+(?:[.,]\d+)?))?\s*\)\s*$/i);
  if (m && (m[1] !== undefined || m[2] !== undefined)) {
    const t: Taak = { tekst: tekst.slice(0, m.index).trim(), meten: true };
    if (m[1] !== undefined) t.min = getal(m[1]);
    if (m[2] !== undefined) t.max = getal(m[2]);
    return t.tekst ? t : null;
  }
  return { tekst, meten: false };
}

/** Tekstvak (een taak per regel) naar taken. */
export const leesRegels = (tekst: string): Taak[] =>
  tekst
    .split(/\r?\n/)
    .map(leesRegel)
    .filter((t): t is Taak => t !== null)
    .slice(0, MAX_TAKEN);

/** Taken terug naar tekst voor het tekstvak. */
export const alsRegel = (t: Taak) =>
  t.meten ? `${t.tekst} (${[t.min !== undefined ? `min ${t.min}` : "", t.max !== undefined ? `max ${t.max}` : ""].filter(Boolean).join(" ")})` : t.tekst;

/** Taken uit de database (Json) veilig terug. */
export function leesTaken(json: unknown): Taak[] {
  if (!Array.isArray(json)) return [];
  return json
    .flatMap((x) => {
      if (!x || typeof x !== "object" || typeof (x as Taak).tekst !== "string") return [];
      const t = x as Taak;
      const uit: Taak = { tekst: t.tekst.slice(0, 140), meten: t.meten === true };
      if (uit.meten && typeof t.min === "number") uit.min = t.min;
      if (uit.meten && typeof t.max === "number") uit.max = t.max;
      return [uit];
    })
    .slice(0, MAX_TAKEN);
}

/** Is de gemeten waarde binnen de grens? null = geen geldig getal. */
export function waardeOk(t: Taak, waarde: string): boolean | null {
  const n = getal(waarde.trim());
  if (!waarde.trim() || Number.isNaN(n)) return null;
  if (t.min !== undefined && n < t.min) return false;
  if (t.max !== undefined && n > t.max) return false;
  return true;
}

/** Wekelijkse lijsten vink je één keer per week af: de periode is de maandag. Anders de dag zelf. */
export function periode(moment: string, datum: string): string {
  if (moment !== "wekelijks") return datum;
  const d = new Date(`${datum}T12:00:00Z`);
  const dag = d.getUTCDay(); // 0 = zondag
  d.setUTCDate(d.getUTCDate() + (dag === 0 ? -6 : 1 - dag));
  return d.toISOString().slice(0, 10);
}

/** Voorbeeldlijsten om mee te beginnen; de zaak past ze zelf aan. */
export const VOORBEELD_LIJSTEN: { naam: string; moment: Moment; regels: string[] }[] = [
  {
    naam: "Opening",
    moment: "opening",
    regels: ["Temperatuur koelcel (max 7)", "Temperatuur vriezer (max -18)", "Handenwasplek: zeep en papier aanwezig", "Werkbanken schoon en ontsmet", "Houdbaarheid producten gecontroleerd"],
  },
  {
    naam: "Sluiting",
    moment: "sluiting",
    regels: ["Temperatuur koelcel (max 7)", "Restjes afgedekt en met datum in de koeling", "Keukenvloer gedweild", "Afval en glas weggebracht", "Gas en apparaten uit"],
  },
  { naam: "Wekelijks", moment: "wekelijks", regels: ["Frituurolie ververst", "Koelcel uitgemest en schoongemaakt", "Ongedierte gecontroleerd"] },
];
