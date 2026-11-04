import { euro, isUitverkocht } from "@/lib/sites/winkel";
import type { SiteProduct } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Zoeken, filteren en sorteren in de winkel van een klantsite (…/winkel?q=…).
// Zonder scripts: één gewoon formulier (GET), en elke actieve filter als link
// om hem weg te halen. Puur, zodat de weergave (lib/sites/winkel-render.ts) en
// de tests dezelfde regels gebruiken.
// ---------------------------------------------------------------------------

export type Sortering = "aanbevolen" | "prijs-op" | "prijs-af" | "naam" | "nieuw" | "korting";

export const SORTERINGEN: { id: Sortering; label: string }[] = [
  { id: "aanbevolen", label: "Aanbevolen" },
  { id: "prijs-op", label: "Prijs: laag naar hoog" },
  { id: "prijs-af", label: "Prijs: hoog naar laag" },
  { id: "naam", label: "Naam (A–Z)" },
  { id: "nieuw", label: "Nieuwste eerst" },
  { id: "korting", label: "Meeste korting" },
];

export interface WinkelFilter {
  /** zoekwoorden */
  q: string;
  /** categorie; "" = alle */
  cat: string;
  /** prijs in hele euro's; null = geen grens */
  min: number | null;
  max: number | null;
  /** alleen wat op voorraad is */
  voorraad: boolean;
  /** alleen aanbiedingen (met een oude prijs) */
  aanbieding: boolean;
  sort: Sortering;
}

export const GEEN_FILTER: WinkelFilter = { q: "", cat: "", min: null, max: null, voorraad: false, aanbieding: false, sort: "aanbevolen" };

const euros = (v: string | null) => {
  if (!v || !v.trim()) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.floor(n) : null;
};

/** Het adres van de winkel uitlezen; wat niet klopt telt niet mee. */
export function leesFilter(q: { get(naam: string): string | null }): WinkelFilter {
  const sort = q.get("sort") ?? "";
  return {
    q: (q.get("q") ?? "").trim().slice(0, 60),
    cat: (q.get("cat") ?? "").trim().slice(0, 60),
    min: euros(q.get("min")),
    max: euros(q.get("max")),
    voorraad: q.get("voorraad") === "1",
    aanbieding: q.get("aanbieding") === "1",
    sort: SORTERINGEN.some((s) => s.id === sort) ? (sort as Sortering) : "aanbevolen",
  };
}

export const heeftFilter = (f: WinkelFilter) => Boolean(f.q || f.cat || f.min !== null || f.max !== null || f.voorraad || f.aanbieding);

const plat = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const korting = (p: SiteProduct) => (p.oudePrijsCents && p.oudePrijsCents > p.prijsCents ? (p.oudePrijsCents - p.prijsCents) / p.oudePrijsCents : 0);

/** De producten die bij het filter passen, in de gekozen volgorde (uitverkocht onderaan, behalve bij naam). */
export function filterProducten(producten: SiteProduct[], f: WinkelFilter): SiteProduct[] {
  const woorden = plat(f.q).split(/\s+/).filter(Boolean);
  const uit = producten.filter((p) => {
    if (f.cat && p.categorie.trim() !== f.cat) return false;
    if (f.min !== null && p.prijsCents < f.min * 100) return false;
    if (f.max !== null && p.prijsCents > f.max * 100) return false;
    if (f.voorraad && isUitverkocht(p)) return false;
    if (f.aanbieding && !korting(p)) return false;
    if (woorden.length) {
      const tekst = plat([p.naam, p.korteTekst, p.categorie, p.omschrijving, ...(p.opties ?? []).flatMap((o) => o.waarden)].join(" "));
      if (!woorden.every((w) => tekst.includes(w))) return false;
    }
    return true;
  });
  const volgorde = new Map(producten.map((p, i) => [p.id, i]));
  const plek = (p: SiteProduct) => volgorde.get(p.id) ?? 0;
  const op = (p: SiteProduct) => (isUitverkocht(p) ? 1 : 0);
  const sorteer: Record<Sortering, (a: SiteProduct, b: SiteProduct) => number> = {
    aanbevolen: (a, b) => op(a) - op(b) || plek(a) - plek(b),
    "prijs-op": (a, b) => op(a) - op(b) || a.prijsCents - b.prijsCents || plek(a) - plek(b),
    "prijs-af": (a, b) => op(a) - op(b) || b.prijsCents - a.prijsCents || plek(a) - plek(b),
    naam: (a, b) => a.naam.localeCompare(b.naam, "nl"),
    // de winkel zet een nieuw product achteraan: nieuwste eerst = van achter naar voren
    nieuw: (a, b) => op(a) - op(b) || plek(b) - plek(a),
    korting: (a, b) => op(a) - op(b) || korting(b) - korting(a) || plek(a) - plek(b),
  };
  return uit.sort(sorteer[f.sort]);
}

/** Het adres-deel na "winkel" voor dit filter met een wijziging ("" zonder filter). */
export function filterQuery(f: WinkelFilter, wijzig: Partial<WinkelFilter> = {}): string {
  const n = { ...f, ...wijzig };
  const q = new URLSearchParams();
  if (n.q) q.set("q", n.q);
  if (n.cat) q.set("cat", n.cat);
  if (n.min !== null) q.set("min", String(n.min));
  if (n.max !== null) q.set("max", String(n.max));
  if (n.voorraad) q.set("voorraad", "1");
  if (n.aanbieding) q.set("aanbieding", "1");
  if (n.sort !== "aanbevolen") q.set("sort", n.sort);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Elke actieve filter als label met het adres zonder dat filter (de "×"-knopjes). */
export function actieveFilters(f: WinkelFilter): { label: string; zonder: string }[] {
  const uit: { label: string; zonder: string }[] = [];
  if (f.q) uit.push({ label: `“${f.q}”`, zonder: filterQuery(f, { q: "" }) });
  if (f.cat) uit.push({ label: f.cat, zonder: filterQuery(f, { cat: "" }) });
  if (f.min !== null || f.max !== null) {
    const label = f.min !== null && f.max !== null ? `${euro(f.min * 100)} – ${euro(f.max * 100)}` : f.min !== null ? `Vanaf ${euro(f.min * 100)}` : `Tot ${euro((f.max ?? 0) * 100)}`;
    uit.push({ label, zonder: filterQuery(f, { min: null, max: null }) });
  }
  if (f.voorraad) uit.push({ label: "Op voorraad", zonder: filterQuery(f, { voorraad: false }) });
  if (f.aanbieding) uit.push({ label: "Aanbiedingen", zonder: filterQuery(f, { aanbieding: false }) });
  return uit;
}

/** "1 product", "12 producten". */
export const productenTekst = (n: number) => (n === 1 ? "1 product" : `${n} producten`);
