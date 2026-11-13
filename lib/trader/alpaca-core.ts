// De AI-trader in Beheer: alleen lezen van de Alpaca-PAPIERrekening (nep-geld). Dit bestand is puur (geen netwerk,
// geen kv, geen env): de typen, het lezen van de antwoorden en de Nederlandse teksten. Het ophalen staat in
// lib/trader/alpaca.ts, en dat doet uitsluitend GET. Er is bewust geen enkele functie om een order te plaatsen.

export const ALPACA_PAPER_HOST = "paper-api.alpaca.markets";
/** Het bedrag waarmee de papierrekening begon (13 nov 2026). Rendement wordt hiertegen gemeten. */
export const STARTBEDRAG = 100_000;

export interface Rekening {
  status: string;
  cash: number;
  vermogen: number;
  /** vermogen aan het einde van de vorige beursdag */
  vorigVermogen: number;
}
export interface Positie {
  symbool: string;
  aantal: number;
  waarde: number;
  koers: number;
  instap: number;
  resultaat: number;
}
export interface Order {
  id: string;
  symbool: string;
  kant: "kopen" | "verkopen";
  aantal: number;
  uitgevoerd: number;
  prijs: number | null;
  status: string;
  ingediend: string | null;
}
export interface Verloop {
  tijden: string[];
  vermogen: number[];
}

const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);

/** Alpaca stuurt getallen als tekst ("100000"); alles wat geen eindig getal is, wordt null. */
export function getal(x: unknown): number | null {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function leesRekening(raw: unknown): Rekening | null {
  const o = obj(raw);
  if (!o) return null;
  const cash = getal(o.cash);
  const vermogen = getal(o.equity) ?? getal(o.portfolio_value);
  if (cash === null || vermogen === null) return null;
  return { status: typeof o.status === "string" ? o.status : "onbekend", cash, vermogen, vorigVermogen: getal(o.last_equity) ?? vermogen };
}

export function leesPosities(raw: unknown): Positie[] {
  if (!Array.isArray(raw)) return [];
  const uit: Positie[] = [];
  for (const r of raw) {
    const o = obj(r);
    const symbool = typeof o?.symbol === "string" ? o.symbol : null;
    const aantal = getal(o?.qty);
    if (!o || !symbool || aantal === null) continue;
    uit.push({ symbool, aantal, waarde: getal(o.market_value) ?? 0, koers: getal(o.current_price) ?? 0, instap: getal(o.avg_entry_price) ?? 0, resultaat: getal(o.unrealized_pl) ?? 0 });
  }
  return uit;
}

export function leesOrders(raw: unknown): Order[] {
  if (!Array.isArray(raw)) return [];
  const uit: Order[] = [];
  for (const r of raw) {
    const o = obj(r);
    const id = typeof o?.id === "string" ? o.id : null;
    const symbool = typeof o?.symbol === "string" ? o.symbol : null;
    if (!o || !id || !symbool) continue;
    uit.push({
      id,
      symbool,
      kant: o.side === "sell" ? "verkopen" : "kopen",
      aantal: getal(o.qty) ?? 0,
      uitgevoerd: getal(o.filled_qty) ?? 0,
      prijs: getal(o.filled_avg_price),
      status: typeof o.status === "string" ? o.status : "onbekend",
      ingediend: typeof o.submitted_at === "string" ? o.submitted_at : typeof o.created_at === "string" ? o.created_at : null,
    });
  }
  return uit;
}

/** portfolio/history: { timestamp: [unix-seconden], equity: [..] }. Lege waarden (null) vallen weg. */
export function leesVerloop(raw: unknown): Verloop {
  const o = obj(raw);
  const t = Array.isArray(o?.timestamp) ? o.timestamp : [];
  const e = Array.isArray(o?.equity) ? o.equity : [];
  const tijden: string[] = [];
  const vermogen: number[] = [];
  for (let i = 0; i < Math.min(t.length, e.length); i += 1) {
    const sec = getal(t[i]);
    const eq = getal(e[i]);
    if (sec === null || eq === null) continue;
    tijden.push(new Date(sec * 1000).toISOString());
    vermogen.push(eq);
  }
  return { tijden, vermogen };
}

/** Rendement als breuk (0,0123 = +1,23%) tegen het startbedrag. */
export function rendement(vermogen: number, start: number = STARTBEDRAG): number {
  return start > 0 ? vermogen / start - 1 : 0;
}

export function procent(breuk: number): string {
  return `${(breuk * 100).toFixed(2).replace(".", ",")}%`.replace(/^(\d)/, "+$1");
}

export function dollars(x: number): string {
  const t = Math.abs(x).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ".").replace(/\.(\d\d)$/, ",$1");
  return `${x < 0 ? "-" : ""}$ ${t}`;
}

export type StatusToon = "ok" | "plan" | "warn" | "crit" | "neutral";

/** De status van een order in gewoon Nederlands. "New" betekent bij Alpaca: aangenomen, nog niet uitgevoerd. */
export function orderStatus(status: string): { tekst: string; toon: StatusToon } {
  switch (status) {
    case "new":
    case "accepted":
    case "pending_new":
    case "accepted_for_bidding":
    case "held":
      return { tekst: "Wacht op de opening van de beurs (meestal 15:30 Nederlandse tijd)", toon: "warn" };
    case "partially_filled":
      return { tekst: "Deels uitgevoerd", toon: "plan" };
    case "filled":
      return { tekst: "Uitgevoerd", toon: "ok" };
    case "canceled":
    case "done_for_day":
      return { tekst: "Geannuleerd", toon: "neutral" };
    case "expired":
      return { tekst: "Verlopen", toon: "neutral" };
    case "rejected":
      return { tekst: "Afgewezen door Alpaca", toon: "crit" };
    default:
      return { tekst: `Status bij Alpaca: ${status}`, toon: "neutral" };
  }
}

/** Is de order nog niet af (wacht of loopt)? */
export function isOpen(status: string): boolean {
  return ["new", "accepted", "pending_new", "accepted_for_bidding", "held", "partially_filled"].includes(status);
}

/** Een eerlijke melding bij een fout van Alpaca, op de statuscode. */
export function alpacaFoutTekst(status: number): string {
  if (status === 401 || status === 403) return "Alpaca weigert de sleutel (401). Controleer het sleutel-id en het geheim, en dat het een papier-sleutel is.";
  if (status === 429) return "Alpaca zegt: te vaak gevraagd (429). Probeer het over een minuut opnieuw.";
  if (status === 404) return "Alpaca kent dit niet (404).";
  return `Alpaca gaf een fout terug (code ${status}).`;
}

/** Een sleutel-id van een papierrekening begint met PK; AK is een echte rekening en wordt hier nooit bewaard. */
export function controleerSleutel(keyId: string, geheim: string): string | null {
  const id = keyId.trim();
  const g = geheim.trim();
  if (!id || !g) return "Vul het sleutel-id en het geheim in.";
  if (/^AK/i.test(id)) return "Dit lijkt een sleutel van een echte rekening (begint met AK). Hier mag alleen een papier-sleutel, die begint met PK.";
  if (!/^PK[A-Za-z0-9]{8,60}$/.test(id)) return "Een papier-sleutel begint met PK, gevolgd door letters en cijfers.";
  if (!/^\S{20,120}$/.test(g)) return "Het geheim lijkt niet te kloppen (minstens 20 tekens, zonder spaties).";
  return null;
}