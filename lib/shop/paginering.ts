// ---------------------------------------------------------------------------
// Paginering van het assortiment (18 nov 2026). Na de CJ-import stonden er 566 kaarten op /shop: 3,0 MB HTML, 573
// afbeeldingen en een pagina van 120.000 px hoog op een telefoon. De winkel toont nu SHOP_PER_PAGINA kaarten per
// pagina; "Toon meer" laadt er in de browser meer bij, en ?pagina=N is een echte link (rel="next"/"prev"), zodat
// Google de hele catalogus blijft zien. Puur bestand: de pagina (server) en de winkelweergave (client) delen het.
// ---------------------------------------------------------------------------

export const SHOP_PER_PAGINA = 48;
export const SHOP_MAX_PAGINA = 500;

/** ?pagina=… uit het adres: een heel getal vanaf 1, anders 1. */
export function paginaUitAdres(v: unknown): number {
  const n = typeof v === "string" ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.min(SHOP_MAX_PAGINA, n) : 1;
}

export interface PaginaVenster {
  /** de pagina die echt getoond wordt (afgekapt op de laatste) */
  pagina: number;
  totaalPaginas: number;
  /** index van de eerste kaart (inclusief) en de laatste (exclusief) */
  van: number;
  tot: number;
}

/** Welke kaarten van de `aantal` resultaten staan op deze pagina, plus wat "Toon meer" er in de browser al bij laadde. */
export function paginaVenster(aantal: number, pagina: number, extra = 0, per = SHOP_PER_PAGINA): PaginaVenster {
  const totaalPaginas = Math.max(1, Math.ceil(Math.max(0, aantal) / per));
  const p = Math.min(Math.max(1, Math.floor(pagina)), totaalPaginas);
  const van = Math.min(aantal, (p - 1) * per);
  const tot = Math.min(aantal, p * per + Math.max(0, extra));
  return { pagina: p, totaalPaginas, van, tot };
}

/** Het adres van een pagina met dezelfde filters; pagina 1 zonder ?pagina=. Lege waarden vallen weg. */
export function paginaAdres(pad: string, params: Readonly<Record<string, string | null | undefined>>, pagina: number): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v.trim() !== "" && k !== "pagina") q.set(k, v.trim().slice(0, 80));
  }
  if (pagina > 1) q.set("pagina", String(Math.floor(pagina)));
  const s = q.toString();
  return s ? `${pad}?${s}` : pad;
}
