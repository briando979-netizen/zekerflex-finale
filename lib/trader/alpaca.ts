import { fetchOfUitval, isServerFout, nietBereikbaar } from "@/lib/http/uitval";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import {
  ALPACA_PAPER_HOST,
  alpacaFoutTekst,
  leesOrders,
  leesPosities,
  leesRekening,
  leesVerloop,
  type Order,
  type Positie,
  type Rekening,
  type Verloop,
} from "@/lib/trader/alpaca-core";

// ---------------------------------------------------------------------------
// Beheer -> AI-trader: de stand van de Alpaca-PAPIERrekening, alleen lezen. ALLEEN GET, ALLEEN de papier-host
// (paper-api.alpaca.markets); er is geen functie om een order te plaatsen of te annuleren (tests/ai-trader.test.ts
// bewaakt dat). De sleutel (id + geheim) komt in Beheer, staat verzegeld in de KV (zoals de Stripe-sleutel in
// lib/billing/stripe-account.ts) en gaat nooit terug naar de browser, een log of de audit.
// ---------------------------------------------------------------------------

export const ALPACA_KV = "ai-trader:alpaca-papier";
const DOEL_ID = "alpaca-papier-id";
const DOEL_GEHEIM = "alpaca-papier-geheim";

interface Opgeslagen {
  id: string; // verzegeld
  geheim: string; // verzegeld
  ingesteldOp: string;
}

export interface Sleutel {
  id: string;
  geheim: string;
}

export class AlpacaFout extends Error {
  readonly status: number;
  constructor(status: number) {
    super(alpacaFoutTekst(status));
    this.name = "AlpacaFout";
    this.status = status;
  }
}

export async function bewaarAlpacaSleutel(s: Sleutel, nu: Date = new Date()): Promise<void> {
  const opslag: Opgeslagen = { id: sealSecret(s.id, DOEL_ID), geheim: sealSecret(s.geheim, DOEL_GEHEIM), ingesteldOp: nu.toISOString() };
  await kvSet(ALPACA_KV, opslag);
}

export async function verwijderAlpacaSleutel(): Promise<void> {
  await kvDelete(ALPACA_KV);
}

/** Staat er een sleutel, en sinds wanneer? Nooit de waarde. */
export async function alpacaSleutelInfo(): Promise<{ aanwezig: boolean; ingesteldOp: string | null }> {
  const o = await kvGet<Opgeslagen>(ALPACA_KV);
  return o?.id && o.geheim ? { aanwezig: true, ingesteldOp: o.ingesteldOp ?? null } : { aanwezig: false, ingesteldOp: null };
}

async function leesSleutel(): Promise<Sleutel | null> {
  const o = await kvGet<Opgeslagen>(ALPACA_KV);
  if (!o?.id || !o.geheim) return null;
  try {
    return { id: openSecret(o.id, DOEL_ID), geheim: openSecret(o.geheim, DOEL_GEHEIM) };
  } catch {
    return null;
  }
}

/** Eén GET naar de papier-host. Een 4xx wordt een AlpacaFout, een netwerkfout of 5xx een nette "niet bereikbaar". */
export async function alpacaGet(pad: string, s: Sleutel): Promise<unknown> {
  const res = await fetchOfUitval("Alpaca", `https://${ALPACA_PAPER_HOST}${pad}`, {
    method: "GET",
    headers: { "APCA-API-KEY-ID": s.id, "APCA-API-SECRET-KEY": s.geheim, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (isServerFout(res.status)) throw nietBereikbaar("Alpaca");
  if (!res.ok) throw new AlpacaFout(res.status);
  return res.json().catch(() => null);
}

/** Controleert een nieuwe sleutel met een enkele GET op de rekening (zonder hem te bewaren). */
export async function controleerAlpacaSleutel(s: Sleutel): Promise<void> {
  const rekening = leesRekening(await alpacaGet("/v2/account", s));
  if (!rekening) throw new AlpacaFout(404);
}

export type TraderStand =
  | { soort: "geen-sleutel" }
  | { soort: "fout"; tekst: string; code: "sleutel" | "limiet" | "onbereikbaar" | "overig" }
  | { soort: "ok"; rekening: Rekening; posities: Positie[]; orders: Order[]; verloop: Verloop; opgehaaldOp: string };

export async function leesTraderStand(nu: Date = new Date()): Promise<TraderStand> {
  let sleutel: Sleutel | null;
  try {
    sleutel = await leesSleutel();
  } catch {
    return { soort: "fout", tekst: "De opslag is nu niet bereikbaar, probeer het later.", code: "onbereikbaar" };
  }
  if (!sleutel) return { soort: "geen-sleutel" };
  try {
    const [rekening, posities, orders, verloop] = await Promise.all([
      alpacaGet("/v2/account", sleutel),
      alpacaGet("/v2/positions", sleutel),
      alpacaGet("/v2/orders?status=all&limit=50&direction=desc", sleutel),
      alpacaGet("/v2/account/portfolio/history?period=1M&timeframe=1D", sleutel),
    ]);
    const r = leesRekening(rekening);
    if (!r) return { soort: "fout", tekst: "Alpaca gaf een antwoord dat we niet konden lezen.", code: "overig" };
    return { soort: "ok", rekening: r, posities: leesPosities(posities), orders: leesOrders(orders), verloop: leesVerloop(verloop), opgehaaldOp: nu.toISOString() };
  } catch (e) {
    if (e instanceof AlpacaFout) {
      return { soort: "fout", tekst: e.message, code: e.status === 401 || e.status === 403 ? "sleutel" : e.status === 429 ? "limiet" : "overig" };
    }
    return { soort: "fout", tekst: "Alpaca is nu niet bereikbaar, probeer het later.", code: "onbereikbaar" };
  }
}