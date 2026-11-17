import { amsterdamDayKey } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Schoolvakanties van de Rijksoverheid (open data, gratis, zonder sleutel): lezen en de eerstvolgende vinden. Puur.
//   bron: https://opendata.rijksoverheid.nl/v1/infotypes/schoolholidays/schoolyear/2026-2027?output=json →
//   { content: [{ vacations: [{ type: " Herfstvakantie ", regions: [{ region: "noord", startdate: "2026-10-10T00:00:00.000Z",
//   enddate: "2026-10-18T21:59:00.000Z" }] }] }] }
// Het begin staat op middernacht UTC en het eind op 23:59 Nederlandse tijd; amsterdamDayKey geeft voor allebei de bedoelde dag.
// ---------------------------------------------------------------------------

export type VakantieRegio = "noord" | "midden" | "zuid" | "heel";

export interface Schoolvakantie {
  naam: string;
  regio: VakantieRegio;
  /** eerste vakantiedag, "YYYY-MM-DD" */
  van: string;
  /** laatste vakantiedag, "YYYY-MM-DD" */
  tot: string;
}

const REGIO: Record<string, VakantieRegio> = { noord: "noord", midden: "midden", zuid: "zuid", "heel nederland": "heel" };

const tekst = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export function leesSchoolvakanties(json: unknown): Schoolvakantie[] {
  const content = json && typeof json === "object" ? (json as Record<string, unknown>).content : undefined;
  const blokken = Array.isArray(content) ? content : [];
  const uit: Schoolvakantie[] = [];
  for (const blok of blokken) {
    const vakanties = blok && typeof blok === "object" ? (blok as Record<string, unknown>).vacations : undefined;
    for (const v of Array.isArray(vakanties) ? vakanties : []) {
      if (!v || typeof v !== "object") continue;
      const naam = tekst((v as Record<string, unknown>).type).slice(0, 40);
      const regios = (v as Record<string, unknown>).regions;
      for (const r of Array.isArray(regios) ? regios : []) {
        if (!r || typeof r !== "object") continue;
        const regio = REGIO[tekst((r as Record<string, unknown>).region).toLowerCase()];
        const van = Date.parse(tekst((r as Record<string, unknown>).startdate));
        const tot = Date.parse(tekst((r as Record<string, unknown>).enddate));
        if (!naam || !regio || !Number.isFinite(van) || !Number.isFinite(tot) || tot < van) continue;
        uit.push({ naam, regio, van: amsterdamDayKey(van), tot: amsterdamDayKey(tot) });
      }
    }
  }
  return uit.sort((a, b) => a.van.localeCompare(b.van));
}

/** Het schooljaar waarin een dag valt ("2026-11-16" → "2026-2027"); het schooljaar begint op 1 augustus. */
export function schooljaarVan(dag: string): string {
  const jaar = Number(dag.slice(0, 4));
  const maand = Number(dag.slice(5, 7));
  return maand >= 8 ? `${jaar}-${jaar + 1}` : `${jaar - 1}-${jaar}`;
}

export interface KomendeVakantie {
  naam: string;
  /** per regio wanneer hij begint en eindigt, vroegste eerst; "heel" = heel Nederland tegelijk */
  regios: { regio: VakantieRegio; van: string; tot: string }[];
  /** dagen tot de eerste regio begint (0 = vandaag) */
  dagen: number;
}

const dagNummer = (d: string) => Math.round(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000);

/**
 * De eerstvolgende vakantie die binnen `binnen` dagen begint (in een regio), of nog niet in alle regio's voorbij is.
 * Een vakantie waarvan de eerste regio al begonnen is, telt mee zolang een andere regio nog moet beginnen.
 */
export function komendeVakantie(lijst: Schoolvakantie[], vandaag: string, binnen = 42): KomendeVakantie | null {
  const nu = dagNummer(vandaag);
  const perNaam = new Map<string, Schoolvakantie[]>();
  for (const v of lijst) {
    if (dagNummer(v.tot) < nu) continue;
    const sleutel = `${v.naam}|${schooljaarVan(v.van)}`;
    perNaam.set(sleutel, [...(perNaam.get(sleutel) ?? []), v]);
  }
  let beste: KomendeVakantie | null = null;
  for (const groep of perNaam.values()) {
    const regios = groep.map((g) => ({ regio: g.regio, van: g.van, tot: g.tot })).sort((a, b) => a.van.localeCompare(b.van));
    const eerste = regios[0];
    if (!eerste) continue;
    // nog een regio die moet beginnen, of de eerste begint binnenkort
    const laatsteBegin = Math.max(...regios.map((r) => dagNummer(r.van)));
    if (laatsteBegin < nu) continue;
    const dagen = Math.max(0, dagNummer(eerste.van) - nu);
    if (dagen > binnen) continue;
    const naam = groep[0]?.naam ?? "";
    if (!beste || dagen < beste.dagen) beste = { naam, regios, dagen };
  }
  return beste;
}
