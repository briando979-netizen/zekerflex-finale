import { amsterdamClock, amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Afhalen en bezorgen (15 nov 2026). Een bestelling is "tafel" (in de zaak),
// "afhalen" (de klant haalt op) of "bezorgen" (wij brengen). Hier staat wat
// puur is: de instellingen van de zaak, de bezorgkosten, de straal, de tijden
// (altijd in Nederlandse tijd, nooit die van de server) en in welke fase een
// levering is. Puur, dus ook in de browser bruikbaar en los te testen.
// ---------------------------------------------------------------------------

export const LEVER_SOORTEN = ["afhalen", "bezorgen"] as const;
export type LeverSoort = (typeof LEVER_SOORTEN)[number];
export type BestelSoort = "tafel" | LeverSoort;

export interface Bezorger {
  id: string;
  naam: string;
  telefoon: string;
  actief: boolean;
}

export interface BezorgInstellingen {
  afhalen: boolean;
  bezorgen: boolean;
  /** tot hoe ver we bezorgen, over de weg */
  straalKm: number;
  /** minimaal bestelbedrag voor bezorgen (zonder bezorgkosten) */
  minimumCent: number;
  kostenCent: number;
  /** vanaf dit bedrag gratis bezorgd; null = altijd kosten */
  gratisVanafCent: number | null;
  /** hoe lang het duurt voor een afhaalbestelling klaarstaat */
  afhaalMinuten: number;
  /** bereiden plus rijden */
  bezorgMinuten: number;
  bezorgers: Bezorger[];
}

export const STANDAARD_BEZORGEN: BezorgInstellingen = {
  afhalen: true,
  bezorgen: false,
  straalKm: 5,
  minimumCent: 1500,
  kostenCent: 250,
  gratisVanafCent: null,
  afhaalMinuten: 20,
  bezorgMinuten: 45,
  bezorgers: [],
};

export const MAX_BEZORGERS = 30;

const getal = (v: unknown, min: number, max: number, standaard: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : standaard);
const geheel = (v: unknown, min: number, max: number, standaard: number) => Math.round(getal(v, min, max, standaard));

/** De instellingen uit de database (Json), met grenzen; wat ontbreekt krijgt de standaard. */
export function leesBezorgen(json: unknown): BezorgInstellingen {
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const s = STANDAARD_BEZORGEN;
  const bezorgers = Array.isArray(j.bezorgers)
    ? j.bezorgers.flatMap((b): Bezorger[] => {
        const x = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
        if (typeof x.id !== "string" || typeof x.naam !== "string" || !x.naam.trim()) return [];
        return [{ id: x.id.slice(0, 40), naam: x.naam.trim().slice(0, 40), telefoon: typeof x.telefoon === "string" ? x.telefoon.slice(0, 20) : "", actief: x.actief !== false }];
      })
    : [];
  return {
    afhalen: typeof j.afhalen === "boolean" ? j.afhalen : s.afhalen,
    bezorgen: typeof j.bezorgen === "boolean" ? j.bezorgen : s.bezorgen,
    straalKm: Math.round(getal(j.straalKm, 0.5, 30, s.straalKm) * 10) / 10,
    minimumCent: geheel(j.minimumCent, 0, 100_000, s.minimumCent),
    kostenCent: geheel(j.kostenCent, 0, 5_000, s.kostenCent),
    gratisVanafCent: j.gratisVanafCent === null ? null : typeof j.gratisVanafCent === "number" ? geheel(j.gratisVanafCent, 0, 100_000, 0) : s.gratisVanafCent,
    afhaalMinuten: geheel(j.afhaalMinuten, 5, 180, s.afhaalMinuten),
    bezorgMinuten: geheel(j.bezorgMinuten, 10, 240, s.bezorgMinuten),
    bezorgers: bezorgers.slice(0, MAX_BEZORGERS),
  };
}

/** De bezorgkosten bij dit bestelbedrag (afhalen is altijd gratis). */
export function bezorgkostenVoor(soort: BestelSoort, subtotaalCent: number, inst: BezorgInstellingen): number {
  if (soort !== "bezorgen") return 0;
  if (inst.gratisVanafCent !== null && subtotaalCent >= inst.gratisVanafCent) return 0;
  return inst.kostenCent;
}

/** Kan dit? Geeft een nette Nederlandse fout, of null. Een onbekende afstand (adres niet gevonden) mag de bediening zelf inschatten. */
export function leverFout(soort: LeverSoort, inst: BezorgInstellingen, b: { subtotaalCent: number; afstandM: number | null }): string | null {
  if (soort === "afhalen") return inst.afhalen ? null : "Afhalen staat uit. Zet het aan bij Afhalen en bezorgen.";
  if (!inst.bezorgen) return "Bezorgen staat uit. Zet het aan bij Afhalen en bezorgen.";
  if (b.subtotaalCent < inst.minimumCent) return `Bezorgen kan vanaf ${euroTekst(inst.minimumCent)}.`;
  if (b.afstandM !== null && b.afstandM > inst.straalKm * 1000) return `We bezorgen tot ${kmTekst(inst.straalKm * 1000)}; dit adres ligt op ${kmTekst(b.afstandM)}.`;
  return null;
}

/** Het btw-tarief met de meeste omzet in deze regels (9 als er niets is): bezorgkosten volgen de maaltijd. */
export function hoofdTarief(regels: readonly { btw: number; prijsCent: number; aantal: number }[]): number {
  const per = new Map<number, number>();
  for (const r of regels) per.set(r.btw, (per.get(r.btw) ?? 0) + r.prijsCent * r.aantal);
  let beste = 9;
  let max = -1;
  for (const [btw, som] of per) {
    if (som > max) {
      beste = btw;
      max = som;
    }
  }
  return beste;
}

/** Wat de klant betaalt: de gerechten, min korting, plus bezorgkosten. */
export const teBetalenCent = (b: { totaalCent: number; kortingCent: number; bezorgkostenCent: number }) => Math.max(0, b.totaalCent - b.kortingCent) + b.bezorgkostenCent;

// --- tijden (Nederlandse tijd) ---------------------------------------------

/** Naar boven afgerond op 5 minuten. */
export function opVijf(d: Date): Date {
  const stap = 5 * 60_000;
  return new Date(Math.ceil(d.getTime() / stap) * stap);
}

/** Het vroegste moment dat het klaar (afhalen) of bezorgd kan zijn. */
export const vroegsteOp = (nu: Date, soort: LeverSoort, inst: BezorgInstellingen) => opVijf(new Date(nu.getTime() + (soort === "afhalen" ? inst.afhaalMinuten : inst.bezorgMinuten) * 60_000));

/** Een tijd ("18:30") op de dag van `nu`, in Nederlandse tijd. Ligt die al ruim voorbij (meer dan 6 uur), dan is het morgen. */
export function tijdOpDag(nu: Date, tijd: string): Date | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(tijd);
  if (!m) return null;
  const p = amsterdamParts(nu);
  const op = amsterdamToUtc(p.year, p.month, p.day, Number(m[1]), Number(m[2]));
  if (op.getTime() < nu.getTime() - 6 * 3600_000) {
    const morgen = amsterdamParts(new Date(Date.UTC(p.year, p.month - 1, p.day + 1, 12)));
    return amsterdamToUtc(morgen.year, morgen.month, morgen.day, Number(m[1]), Number(m[2]));
  }
  return op;
}

/**
 * Online bestellen (ronde 4): de tijden (per kwartier, "UU:MM") waarop een bestelling vandaag klaar of bezorgd kan
 * zijn, van de vroegste tijd (nu of de opening, plus de bereidingstijd) tot sluiten; en of "zo snel mogelijk" kan
 * (alleen als de zaak nu open is en het voor sluiten lukt). Openingstijden per weekdag, 0 = zondag (lib/horeca/tijden.ts).
 */
export function leverSlots(nu: Date, soort: LeverSoort, inst: BezorgInstellingen, tijden: Record<string, { van: string; tot: string } | null>): { slots: string[]; zsm: boolean } {
  const p = amsterdamParts(nu);
  const vandaag = tijden[String(p.weekday)];
  if (!vandaag) return { slots: [], zsm: false };
  const [vh = 0, vm = 0] = vandaag.van.split(":").map(Number);
  const [th = 0, tm = 0] = vandaag.tot.split(":").map(Number);
  const open = amsterdamToUtc(p.year, p.month, p.day, vh, vm);
  let dicht = amsterdamToUtc(p.year, p.month, p.day, th, tm);
  // een tot vóór de van loopt door na middernacht (bar tot 02:00)
  if (dicht.getTime() <= open.getTime()) dicht = new Date(dicht.getTime() + 24 * 3600_000);
  const minuten = soort === "afhalen" ? inst.afhaalMinuten : inst.bezorgMinuten;
  const vroegste = vroegsteOp(nu, soort, inst);
  const begin = new Date(Math.max(vroegste.getTime(), open.getTime() + minuten * 60_000));
  const kwartier = 15 * 60_000;
  const slots: string[] = [];
  for (let t = Math.ceil(begin.getTime() / kwartier) * kwartier; t <= dicht.getTime() && slots.length < 96; t += kwartier) slots.push(amsterdamClock(t));
  const zsm = nu.getTime() >= open.getTime() && vroegste.getTime() <= dicht.getTime();
  return { slots, zsm };
}

/** Een tijd een paar minuten verschuiven (de − en + bij "tijd bevestigen"). */
export const schuif = (op: Date, minuten: number) => new Date(op.getTime() + minuten * 60_000);

/** "18:30", of "ZSM" als de klant zo snel mogelijk wil. */
export const tijdTekst = (op: Date | string | null) => (op ? amsterdamClock(op) : "ZSM");

// --- fasen ------------------------------------------------------------------

export type LeverFase = "bevestigen" | "keuken" | "klaar" | "onderweg" | "afgeleverd" | "geannuleerd";

export const FASE_LABEL: Record<LeverFase, string> = {
  bevestigen: "Tijd bevestigen",
  keuken: "In de keuken",
  klaar: "Klaar",
  onderweg: "Onderweg",
  afgeleverd: "Afgeleverd",
  geannuleerd: "Geannuleerd",
};

/** In welke fase een afhaal- of bezorgbestelling is (afgeleid; niets dubbel opgeslagen). */
export function leverFase(b: { soort: string; status: string; bevestigdOp: Date | string | null; onderwegOp: Date | string | null; afgeleverdOp: Date | string | null }): LeverFase {
  if (b.status === "GEANNULEERD") return "geannuleerd";
  if (b.afgeleverdOp) return "afgeleverd";
  if (b.onderwegOp) return "onderweg";
  if (!b.bevestigdOp) return "bevestigen";
  if (b.status === "KLAAR" || b.status === "GESERVEERD") return "klaar";
  return "keuken";
}

// --- weergave en invoer -----------------------------------------------------

export function euroTekst(cent: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cent / 100);
}

/** "650 m" of "1,8 km". */
export function kmTekst(meter: number): string {
  if (meter < 1000) return `${Math.round(meter / 10) * 10} m`;
  return `${(meter / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
}

/** Een Nederlandse postcode netjes ("1056 AB"), of null als het er geen is. */
export function postcodeNetjes(p: string): string | null {
  const m = /^\s*([1-9]\d{3})\s?([A-Za-z]{2})\s*$/.exec(p);
  return m ? `${m[1]} ${(m[2] ?? "").toUpperCase()}` : null;
}

/** Een telefoonnummer om mee te bellen (cijfers en een + vooraan), of null als het te kort is. */
export function belbaar(t: string): string | null {
  const schoon = t.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return schoon.replace(/\D/g, "").length >= 8 ? schoon : null;
}
