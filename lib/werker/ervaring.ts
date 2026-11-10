// ---------------------------------------------------------------------------
// Werkervaring van een werker (11 nov 2026): een korte lijst die hij zelf invult na de
// ID-controle (stap 2 van "Maak een goede eerste indruk", /dashboard/eerste-indruk).
// Puur bestand (geen prisma/kv/zod), zodat scherm, route en tests dezelfde regels delen.
// De opslag staat in lib/werker/ervaring-store.ts (KV werker-ervaring:<userId>).
//
// Zichtbaarheid: alleen de werker zelf (eigen profiel). Voor opdrachtgevers is het
// bewust nog NIET te zien: dat besluit de eigenaar.
// ---------------------------------------------------------------------------

export const ERVARING_MAX = 10;
export const FUNCTIE_MAX = 80;
export const BEDRIJF_MAX = 80;
export const OMSCHRIJVING_MAX = 300;
export const ERVARING_EERSTE_JAAR = 1960;

export interface Ervaring {
  id: string;
  functie: string;
  bedrijf: string;
  vanMaand: number;
  vanJaar: number;
  /** werkt hier nu nog: dan geen eindmaand */
  nu: boolean;
  totMaand: number | null;
  totJaar: number | null;
  omschrijving: string;
}

export interface ErvaringInvoer {
  /** niet verplicht: de bedrijfsnaam is genoeg (de eigenaar, 11 nov) */
  functie: string;
  bedrijf: string;
  vanMaand: number;
  vanJaar: number;
  nu: boolean;
  totMaand?: number | null | undefined;
  totJaar?: number | null | undefined;
  omschrijving?: string | undefined;
}

export interface ErvaringStand {
  items: Ervaring[];
  /** de werker koos "Ik heb nog geen werkervaring": ook een geldige afronding van de stap */
  geen: boolean;
}

/** Tekst zonder tekens die in HTML iets betekenen of onzichtbaar zijn; spaties netjes. */
export function schoonTekst(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function maandJaarOk(maand: unknown, jaar: unknown, huidigJaar: number): boolean {
  return (
    Number.isInteger(maand) &&
    Number.isInteger(jaar) &&
    (maand as number) >= 1 &&
    (maand as number) <= 12 &&
    (jaar as number) >= ERVARING_EERSTE_JAAR &&
    (jaar as number) <= huidigJaar
  );
}

export type ErvaringUitslag = { ok: true; waarde: Omit<Ervaring, "id"> } | { ok: false; fout: string };

/** Controleert en maakt schoon; de foutzin is gewoon Nederlands (de route geeft hem als 422). */
export function controleerErvaring(i: ErvaringInvoer, huidigJaar: number, huidigeMaand: number): ErvaringUitslag {
  const functie = schoonTekst(i.functie, FUNCTIE_MAX);
  const bedrijf = schoonTekst(i.bedrijf, BEDRIJF_MAX);
  const omschrijving = schoonTekst(i.omschrijving ?? "", OMSCHRIJVING_MAX);
  if (!bedrijf) return { ok: false, fout: "Vul de naam van het bedrijf in." };
  if (!maandJaarOk(i.vanMaand, i.vanJaar, huidigJaar)) return { ok: false, fout: "Kies een geldige begindatum." };
  if (i.vanJaar === huidigJaar && i.vanMaand > huidigeMaand) return { ok: false, fout: "De begindatum ligt in de toekomst." };
  if (i.nu) {
    return { ok: true, waarde: { functie, bedrijf, vanMaand: i.vanMaand, vanJaar: i.vanJaar, nu: true, totMaand: null, totJaar: null, omschrijving } };
  }
  const totMaand = i.totMaand ?? 0;
  const totJaar = i.totJaar ?? 0;
  if (!maandJaarOk(totMaand, totJaar, huidigJaar)) return { ok: false, fout: "Kies een geldige einddatum, of vink aan dat je hier nu werkt." };
  if (totJaar === huidigJaar && totMaand > huidigeMaand) return { ok: false, fout: "De einddatum ligt in de toekomst." };
  if (totJaar * 12 + totMaand < i.vanJaar * 12 + i.vanMaand) return { ok: false, fout: "De einddatum ligt vóór de begindatum." };
  return { ok: true, waarde: { functie, bedrijf, vanMaand: i.vanMaand, vanJaar: i.vanJaar, nu: false, totMaand, totJaar, omschrijving } };
}

/** Nieuwste eerst: lopend werk bovenaan, daarna op einddatum en begindatum aflopend. */
export function sorteerErvaring(items: Ervaring[]): Ervaring[] {
  const sleutel = (e: Ervaring) => (e.nu ? 1e5 : (e.totJaar ?? 0) * 12 + (e.totMaand ?? 0)) * 1e5 + e.vanJaar * 12 + e.vanMaand;
  return [...items].sort((a, b) => sleutel(b) - sleutel(a));
}

/** Leest een bewaarde waarde soepel: een kapot item wordt overgeslagen, nooit een fout. */
export function leesErvaringStand(raw: unknown, huidigJaar: number, huidigeMaand: number): ErvaringStand {
  if (!raw || typeof raw !== "object") return { items: [], geen: false };
  const r = raw as { items?: unknown; geen?: unknown };
  const items: Ervaring[] = [];
  if (Array.isArray(r.items)) {
    for (const x of r.items) {
      if (!x || typeof x !== "object" || items.length >= ERVARING_MAX) continue;
      const e = x as Record<string, unknown>;
      const id = e["id"];
      if (typeof id !== "string" || !id) continue;
      const uitslag = controleerErvaring(
        {
          functie: String(e["functie"] ?? ""),
          bedrijf: String(e["bedrijf"] ?? ""),
          vanMaand: Number(e["vanMaand"]),
          vanJaar: Number(e["vanJaar"]),
          nu: e["nu"] === true,
          totMaand: e["totMaand"] == null ? null : Number(e["totMaand"]),
          totJaar: e["totJaar"] == null ? null : Number(e["totJaar"]),
          omschrijving: String(e["omschrijving"] ?? ""),
        },
        huidigJaar,
        huidigeMaand,
      );
      if (uitslag.ok) items.push({ id, ...uitslag.waarde });
    }
  }
  return { items: sorteerErvaring(items), geen: r.geen === true };
}

/** "mrt 2022 – nu": de maandnamen en het woord voor "nu" komen van de aanroeper (per taal). */
export function ervaringPeriode(e: Ervaring, maanden: readonly string[], nuTekst: string): string {
  const m = (n: number | null) => maanden[(n ?? 1) - 1] ?? String(n ?? "");
  const van = `${m(e.vanMaand)} ${e.vanJaar}`;
  return e.nu ? `${van} – ${nuTekst}` : `${van} – ${m(e.totMaand)} ${e.totJaar ?? ""}`.trim();
}
