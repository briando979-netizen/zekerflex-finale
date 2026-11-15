import { amsterdamDayKey, amsterdamParts, amsterdamStartOfDay } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// De week in vijf getallen (15 nov 2026): bezoekers, aanmeldingen, geplaatste klussen, gewerkte uren en wat er betaald
// is, per week (maandag tot maandag, Nederlandse tijd), de laatste acht weken. Alles zonder test: zo zie je elke week
// of iets echt beweegt, en bouw je alleen wat een van deze getallen omhoog helpt. Puur: lib/admin/weekcijfers.ts haalt
// de feiten op.
// ---------------------------------------------------------------------------

export const WEKEN = 8;

export interface Week {
  /** maandag als "2026-11-09" */
  key: string;
  /** "9 nov" */
  label: string;
  van: Date;
  tot: Date;
  /** de week van vandaag, nog niet om */
  lopend: boolean;
}

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"] as const;

/** De laatste `aantal` weken tot en met de lopende, oudste eerst. Zomer- en wintertijd veilig (amsterdamStartOfDay). */
export function weken(nu: Date, aantal: number = WEKEN): Week[] {
  const sindsMaandag = (amsterdamParts(nu).weekday + 6) % 7;
  const uit: Week[] = [];
  for (let i = aantal - 1; i >= 0; i--) {
    const van = amsterdamStartOfDay(nu, -sindsMaandag - 7 * i);
    const tot = amsterdamStartOfDay(nu, -sindsMaandag - 7 * i + 7);
    const p = amsterdamParts(van);
    uit.push({ key: amsterdamDayKey(van), label: `${p.day} ${MAANDEN[p.month - 1] ?? ""}`, van, tot, lopend: i === 0 });
  }
  return uit;
}

/** Tel (of tel op) per week; wat buiten de weken valt telt niet. */
export function perWeek<T>(w: readonly Week[], rijen: readonly T[], at: (r: T) => Date | null | undefined, waarde: (r: T) => number = () => 1): number[] {
  const uit = w.map(() => 0);
  for (const r of rijen) {
    const t = at(r)?.getTime();
    if (t === undefined || !Number.isFinite(t)) continue;
    const i = w.findIndex((x) => t >= x.van.getTime() && t < x.tot.getTime());
    if (i >= 0) uit[i] = (uit[i] ?? 0) + waarde(r);
  }
  return uit;
}

export type WeekSleutel = "bezoekers" | "aanmeldingen" | "klussen" | "uren" | "betaald";
export type Eenheid = "aantal" | "uren" | "euro";

export interface WeekRij {
  sleutel: WeekSleutel;
  label: string;
  uitleg: string;
  eenheid: Eenheid;
  /** per week, oudste eerst; bij euro in centen */
  waarden: number[];
}

export const WEEK_RIJEN: readonly Omit<WeekRij, "waarden">[] = [
  { sleutel: "bezoekers", label: "Bezoekers", uitleg: "unieke bezoekers op de site", eenheid: "aantal" },
  { sleutel: "aanmeldingen", label: "Aanmeldingen", uitleg: "nieuwe accounts, zonder test- en eigen accounts", eenheid: "aantal" },
  { sleutel: "klussen", label: "Klussen geplaatst", uitleg: "door echte bedrijven, zonder testklussen", eenheid: "aantal" },
  { sleutel: "uren", label: "Gewerkte uren", uitleg: "goedgekeurde uren bij echte bedrijven", eenheid: "uren" },
  { sleutel: "betaald", label: "Betaald", uitleg: "betaalde facturen aan ZekerFlex en webshopbestellingen", eenheid: "euro" },
];

export interface WeekCijfers {
  weken: Pick<Week, "key" | "label" | "lopend">[];
  rijen: WeekRij[];
}

/** De vijf rijen in vaste volgorde; een getal dat niet op te halen was staat op 0 (de tegel blijft staan). */
export function weekCijfers(w: readonly Week[], waarden: Partial<Record<WeekSleutel, number[]>>): WeekCijfers {
  return {
    weken: w.map(({ key, label, lopend }) => ({ key, label, lopend })),
    rijen: WEEK_RIJEN.map((r) => ({ ...r, waarden: w.map((_, i) => waarden[r.sleutel]?.[i] ?? 0) })),
  };
}

/** Beweegt er iets? Vergelijkt de laatste hele week met de week ervoor: omhoog, omlaag, gelijk (of niets om te vergelijken). */
export function richting(waarden: readonly number[]): "omhoog" | "omlaag" | "gelijk" | null {
  // de lopende week is nog niet om: vergelijk de twee weken daarvoor
  const nu = waarden[waarden.length - 2];
  const vorige = waarden[waarden.length - 3];
  if (nu === undefined || vorige === undefined) return null;
  if (nu === vorige) return "gelijk";
  return nu > vorige ? "omhoog" : "omlaag";
}
