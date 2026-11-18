// ---------------------------------------------------------------------------
// "Alles overnemen" (18 nov 2026): een hele zoekuitslag van CJ (bv. 758 producten) komt niet
// in één HTTP-verzoek de winkel in, maar via een wachtrij in KV die een cron elke twee minuten
// een stukje verder brengt: een pagina van de zoekuitslag ophalen (50 per keer), dan product
// voor product overnemen met de bestaande claims. Een uitrol of herstart raakt niets kwijt:
// de stand staat na elk product in KV. Dit is het pure deel (ook los te testen); het werk
// zelf staat in lib/shop/cj/wachtrij.ts.
// ---------------------------------------------------------------------------

export type WachtrijStatus = "loopt" | "pauze" | "gestopt" | "klaar";

export interface CjWachtrij {
  id: string;
  /** de zoekopdracht zoals aan CJ gesteld (al Engels) en wat de eigenaar typte */
  q: string;
  getypt: string;
  land: string;
  categorie: string | null;
  /** meteen aan in de winkel (alleen met foto, variant én Nederlandse tekst) */
  actief: boolean;
  /** zoveel treffers meldde CJ bij de start */
  totaal: number;
  paginaVolgende: number;
  paginaKlaar: boolean;
  /** pids uit opgehaalde pagina's die nog moeten */
  buffer: string[];
  gedaan: number;
  bestaand: number;
  mislukt: number;
  /** overgenomen maar nog Engels (het model was weg): staan uit tot de vertaling lukt */
  nogTeVertalen: number;
  fouten: { pid: string; fout: string }[];
  status: WachtrijStatus;
  gestartOp: string;
  bijgewerktOp: string;
  laatsteRondeOp: string | null;
  laatsteFout: string | null;
}

/** CJ geeft hooguit 50 per pagina; zoveel producten per ronde van de cron (±25 s per product). */
export const WACHTRIJ_PER_PAGINA = 50;
export const WACHTRIJ_PER_RONDE = 4;
/** zoveel fouten onthouden we (de laatste) */
export const WACHTRIJ_MAX_FOUTEN = 20;
/** gemeten richtwaarde: productdetail + verzendtarief + voorraad + 6 foto's + vertaling door het eigen model */
export const SECONDEN_PER_PRODUCT = 25;
/** de cron komt elke 2 minuten en doet dan WACHTRIJ_PER_RONDE producten */
export const SECONDEN_PER_RONDE = 120;

export function nieuweWachtrij(o: { q: string; getypt: string; land: string; categorie: string | null; actief: boolean; totaal: number; eerstePagina: string[]; now?: Date }): CjWachtrij {
  const now = (o.now ?? new Date()).toISOString();
  const totaal = Math.max(0, Math.round(o.totaal));
  return {
    id: `w${Date.parse(now).toString(36)}`,
    q: o.q,
    getypt: o.getypt,
    land: o.land,
    categorie: o.categorie,
    actief: o.actief,
    totaal,
    paginaVolgende: 2,
    paginaKlaar: o.eerstePagina.length < WACHTRIJ_PER_PAGINA || totaal <= WACHTRIJ_PER_PAGINA,
    buffer: [...new Set(o.eerstePagina)],
    gedaan: 0,
    bestaand: 0,
    mislukt: 0,
    nogTeVertalen: 0,
    fouten: [],
    status: totaal === 0 || o.eerstePagina.length === 0 ? "klaar" : "loopt",
    gestartOp: now,
    bijgewerktOp: now,
    laatsteRondeOp: null,
    laatsteFout: null,
  };
}

/** Wat de volgende stap is: een pagina ophalen, een product doen, klaar, of niets (pauze/gestopt). */
export function volgendeStap(w: CjWachtrij): "pagina" | "product" | "klaar" | "wacht" {
  if (w.status !== "loopt") return "wacht";
  if (w.buffer.length > 0) return "product";
  if (!w.paginaKlaar) return "pagina";
  return "klaar";
}

/** Een pagina van de zoekuitslag is binnen: pids erbij (zonder dubbele), en weten of er nog een pagina is. */
export function metPagina(w: CjWachtrij, pids: string[], now = new Date()): CjWachtrij {
  const bekend = new Set(w.buffer);
  const nieuw = [...new Set(pids)].filter((p) => p && !bekend.has(p));
  const paginaKlaar = pids.length < WACHTRIJ_PER_PAGINA || w.paginaVolgende * WACHTRIJ_PER_PAGINA >= w.totaal;
  return { ...w, buffer: [...w.buffer, ...nieuw], paginaVolgende: w.paginaVolgende + 1, paginaKlaar, bijgewerktOp: now.toISOString(), laatsteFout: null };
}

export type ProductUitkomst = "gedaan" | "bestaand" | "mislukt" | "nogTeVertalen";

/** Eén product is afgehandeld (goed of fout): tellers bij, pid uit de buffer. */
export function metProduct(w: CjWachtrij, pid: string, uitkomst: ProductUitkomst, fout: string | null = null, now = new Date()): CjWachtrij {
  const buffer = w.buffer.filter((p) => p !== pid);
  const fouten = uitkomst === "mislukt" ? [...w.fouten, { pid, fout: (fout ?? "onbekend").slice(0, 160) }].slice(-WACHTRIJ_MAX_FOUTEN) : w.fouten;
  const n: CjWachtrij = {
    ...w,
    buffer,
    fouten,
    gedaan: w.gedaan + (uitkomst === "gedaan" || uitkomst === "nogTeVertalen" ? 1 : 0),
    bestaand: w.bestaand + (uitkomst === "bestaand" ? 1 : 0),
    mislukt: w.mislukt + (uitkomst === "mislukt" ? 1 : 0),
    nogTeVertalen: w.nogTeVertalen + (uitkomst === "nogTeVertalen" ? 1 : 0),
    bijgewerktOp: now.toISOString(),
    laatsteRondeOp: now.toISOString(),
  };
  if (n.buffer.length === 0 && n.paginaKlaar && n.status === "loopt") n.status = "klaar";
  return n;
}

/** Hoeveel is er afgehandeld (goed, bestond al, of mislukt) en hoeveel blijft er over? */
export function voortgang(w: CjWachtrij): { afgehandeld: number; rest: number; procent: number } {
  const afgehandeld = w.gedaan + w.bestaand + w.mislukt;
  const rest = Math.max(0, w.totaal - afgehandeld);
  return { afgehandeld, rest, procent: w.totaal > 0 ? Math.min(100, Math.round((afgehandeld / w.totaal) * 100)) : 100 };
}

/** Een eerlijke schatting van de resterende tijd, op het tempo van de cron (4 per 2 minuten). */
export function schatting(w: CjWachtrij): { seconden: number; tekst: string } {
  const { rest } = voortgang(w);
  if (w.status !== "loopt" || rest === 0) return { seconden: 0, tekst: "" };
  const perProduct = Math.max(SECONDEN_PER_PRODUCT, SECONDEN_PER_RONDE / WACHTRIJ_PER_RONDE);
  const seconden = Math.round(rest * perProduct);
  const uur = Math.floor(seconden / 3600);
  const min = Math.round((seconden % 3600) / 60);
  return { seconden, tekst: uur > 0 ? `ongeveer ${uur} uur${min ? ` en ${min} minuten` : ""}` : `ongeveer ${Math.max(1, min)} minuten` };
}

/** Status in gewone woorden. */
export function wachtrijTekst(w: CjWachtrij): string {
  const v = voortgang(w);
  const basis = `${v.afgehandeld} van ${w.totaal}`;
  switch (w.status) {
    case "loopt":
      return `${basis} gedaan, loopt`;
    case "pauze":
      return `${basis} gedaan, op pauze`;
    case "gestopt":
      return `${basis} gedaan, gestopt`;
    default:
      return `${basis} gedaan, klaar`;
  }
}
