import { REACTIE_MARGE_MS } from "@/lib/offers/verval";

// ---------------------------------------------------------------------------
// De reactietabel op de kluspagina van een bedrijf (23 nov 2026, components/werkgever/ReactieLijst.tsx): sorteren, de
// regels voor de drie knoppen onder de tabel, de aftelling tot een reactie vervalt en de kostenindicatie. Puur, zodat het
// scherm en de test (tests/reactie-tabel.test.ts) dezelfde regels delen.
// ---------------------------------------------------------------------------

export type SorteerKolom = "naam" | "beoordeling" | "opkomst" | "uren" | "tarief";
export type SorteerRichting = "op" | "af";

export interface ReactieVoorSortering {
  naam: string;
  reviewAverage: number;
  reviewCount: number;
  /** % compleet; null = nieuw op ZekerFlex */
  compleetPct: number | null;
  urenBijBedrijf: number;
  proposedRateCents: number;
}

/** De waarde waarop een kolom sorteert; null = geen cijfer (staat altijd onderaan). */
function waarde(r: ReactieVoorSortering, kolom: SorteerKolom): number | string | null {
  if (kolom === "naam") return r.naam.toLowerCase();
  if (kolom === "beoordeling") return r.reviewCount > 0 ? r.reviewAverage : null;
  if (kolom === "opkomst") return r.compleetPct;
  if (kolom === "uren") return r.urenBijBedrijf;
  return r.proposedRateCents;
}

/** Een nieuwe, gesorteerde lijst. Wie geen cijfer heeft staat onderaan, in beide richtingen; gelijke waarden houden hun volgorde. */
export function sorteerReacties<T extends ReactieVoorSortering>(rijen: readonly T[], kolom: SorteerKolom, richting: SorteerRichting): T[] {
  const teken = richting === "op" ? 1 : -1;
  return rijen
    .map((r, i) => ({ r, i, w: waarde(r, kolom) }))
    .sort((a, b) => {
      if (a.w === null || b.w === null) return a.w === b.w ? a.i - b.i : a.w === null ? 1 : -1;
      const v = typeof a.w === "string" || typeof b.w === "string" ? String(a.w).localeCompare(String(b.w), "nl") : a.w - b.w;
      return v === 0 ? a.i - b.i : v * teken;
    })
    .map((x) => x.r);
}

/** De eerste klik op een kolom sorteert aflopend (naam: oplopend); nog een klik keert om. */
export function volgendeSortering(huidig: { kolom: SorteerKolom; richting: SorteerRichting } | null, kolom: SorteerKolom): { kolom: SorteerKolom; richting: SorteerRichting } {
  if (huidig?.kolom === kolom) return { kolom, richting: huidig.richting === "op" ? "af" : "op" };
  return { kolom, richting: kolom === "naam" ? "op" : "af" };
}

export interface SelectieStand {
  /** hoeveel er meer zijn gekozen dan er plekken vrij zijn (0 = past) */
  teVeel: number;
  magAccepteren: boolean;
  magReserve: boolean;
  magWeigeren: boolean;
}

/**
 * Wat mag er met de gekozen reacties? Accepteren alleen als ze allemaal een plek krijgen; op de reservebank zetten mag
 * altijd zolang die open is (er is juist geen plek nodig); weigeren mag altijd.
 */
export function selectieStand(gekozen: number, plekkenVrij: number, reservebankOpen: boolean): SelectieStand {
  const teVeel = Math.max(0, gekozen - Math.max(0, plekkenVrij));
  return {
    teVeel,
    magAccepteren: gekozen > 0 && teVeel === 0,
    magReserve: gekozen > 0 && reservebankOpen,
    magWeigeren: gekozen > 0,
  };
}

/**
 * Over hoeveel dagen en uren vervalt een open reactie? Dat is 2 uur na de start van de klus (lib/offers/verval.ts).
 * null = al vervallen.
 */
export function verlooptOver(startsAt: Date | string, nowMs: number): { dagen: number; uren: number } | null {
  const rest = new Date(startsAt).getTime() + REACTIE_MARGE_MS - nowMs;
  if (!Number.isFinite(rest) || rest <= 0) return null;
  const uren = Math.floor(rest / 3_600_000);
  return { dagen: Math.floor(uren / 24), uren: uren % 24 };
}

/** Biedt de werker meer of minder dan het geplaatste tarief? null = gewoon het geplaatste tarief. */
export function tegenbod(proposedRateCents: number, listedRateCents: number): "hoger" | "lager" | null {
  if (proposedRateCents === listedRateCents) return null;
  return proposedRateCents > listedRateCents ? "hoger" : "lager";
}

/**
 * Wat één kracht ongeveer kost: zijn tarief maal de betaalde uren, plus de platformkosten per uur (0 voor een kosteloos
 * bedrijf). Exclusief btw, in centen.
 */
export function kostenIndicatie(rateCents: number, uren: number, feePerUurCents: number): number {
  const u = Math.max(0, uren);
  return Math.round(u * rateCents) + Math.round(u * Math.max(0, feePerUurCents));
}
