// ---------------------------------------------------------------------------
// CJ Dropshipping, de koppeling (server). Gratis met een CJ-account: elke dag 50.000
// punten, een productzoekopdracht kost 50, een productdetail 10, en hooguit één aanvraag
// per seconde. De sleutel plakt de eigenaar in Beheer → Winkel-AI → Leverancier; hij
// staat in KV (shop:cj:sleutel) en komt nooit terug naar de browser en nooit in een log.
// Het toegangsbewijs (180 dagen) bewaren we ernaast en vernieuwen we op tijd.
// Lezen: lib/shop/cj/cj-core.ts; overnemen in de webshop: lib/shop/cj/importeer.ts.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { goedkoopsteVerzending, leesCjProduct, leesCjTreffer, leesVoorraadPerVariant, type CjProduct, type CjVerzending, type CjZoekTreffer } from "@/lib/shop/cj/cj-core";

export const CJ_HOST = "developers.cjdropshipping.com";
const BASIS = `https://${CJ_HOST}/api2.0/v1/`;
const K_SLEUTEL = "shop:cj:sleutel";
const K_TOKEN = "shop:cj:token";
const K_STAND = "shop:cj:stand";
/** minstens zoveel ms tussen twee aanvragen (CJ: 1 per seconde voor een gratis account) */
const TUSSENPOOS_MS = 1100;
const TIJDLIMIET_MS = 20_000;

interface Token {
  accessToken: string;
  verlooptOp: string;
  refreshToken: string | null;
  refreshVerlooptOp: string | null;
}
interface Stand {
  laatsteOk: string | null;
  laatsteFout: string | null;
  laatsteFoutOp: string | null;
}
interface CjAntwoord<T> {
  code?: unknown;
  result?: unknown;
  message?: unknown;
  data?: T;
}

// Eén wachtrij per proces (globalThis: Next bundelt routes apart), zodat twee routes samen niet boven 1/s komen.
const g = globalThis as typeof globalThis & { __zfCjLaatste?: number; __zfCjRij?: Promise<void> };

async function omDeBeurt<T>(werk: () => Promise<T>): Promise<T> {
  const vorige = g.__zfCjRij ?? Promise.resolve();
  let klaar!: () => void;
  g.__zfCjRij = new Promise<void>((r) => (klaar = r));
  try {
    await vorige;
    const wacht = (g.__zfCjLaatste ?? 0) + TUSSENPOOS_MS - Date.now();
    if (wacht > 0) await new Promise((r) => setTimeout(r, wacht));
    g.__zfCjLaatste = Date.now();
    return await werk();
  } finally {
    klaar();
  }
}

async function noteer(deel: Partial<Stand>): Promise<void> {
  const nu = (await kvGet<Stand>(K_STAND).catch(() => null)) ?? { laatsteOk: null, laatsteFout: null, laatsteFoutOp: null };
  await kvSet(K_STAND, { ...nu, ...deel }).catch(() => undefined);
}

async function post<T>(pad: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${BASIS}${pad}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "CJ-Access-Token": token } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIJDLIMIET_MS),
  }).catch((e: unknown) => {
    throw AppError.upstream(`CJ is niet bereikbaar (${e instanceof Error ? e.name : "fout"}).`);
  });
  const d = (await res.json().catch(() => ({}))) as CjAntwoord<T>;
  if (!res.ok || d.result !== true || d.code !== 200 || d.data === undefined) {
    const m = typeof d.message === "string" ? d.message.slice(0, 160) : `HTTP ${res.status}`;
    throw AppError.upstream(`CJ: ${m}`);
  }
  return d.data;
}

const leesTokenData = (d: Record<string, unknown>): Token | null => {
  const at = typeof d.accessToken === "string" ? d.accessToken : "";
  const tot = typeof d.accessTokenExpiryDate === "string" ? d.accessTokenExpiryDate : "";
  if (!at || !tot) return null;
  return {
    accessToken: at,
    verlooptOp: new Date(tot).toISOString(),
    refreshToken: typeof d.refreshToken === "string" ? d.refreshToken : null,
    refreshVerlooptOp: typeof d.refreshTokenExpiryDate === "string" ? new Date(d.refreshTokenExpiryDate).toISOString() : null,
  };
};

async function nieuwToken(sleutel: string): Promise<Token> {
  const d = await post<Record<string, unknown>>("authentication/getAccessToken", { apiKey: sleutel });
  const t = leesTokenData(d);
  if (!t) throw AppError.upstream("CJ gaf geen toegangsbewijs terug.");
  return t;
}

async function vernieuwToken(refreshToken: string): Promise<Token> {
  const d = await post<Record<string, unknown>>("authentication/refreshAccessToken", { refreshToken });
  const t = leesTokenData(d);
  if (!t) throw AppError.upstream("CJ gaf geen vernieuwd toegangsbewijs terug.");
  return t;
}

/** Of er een sleutel staat (de sleutel zelf verlaat de server nooit). */
export async function cjSleutelIngesteld(): Promise<boolean> {
  return Boolean(await kvGet<string>(K_SLEUTEL).catch(() => null));
}

/** Sleutel opslaan (eerst proberen: een foute sleutel wordt niet bewaard) of weghalen met null. */
export async function zetCjSleutel(sleutel: string | null): Promise<void> {
  if (sleutel === null) {
    await Promise.all([kvDelete(K_SLEUTEL), kvDelete(K_TOKEN)]);
    await noteer({ laatsteOk: null, laatsteFout: null, laatsteFoutOp: null });
    return;
  }
  const s = sleutel.trim();
  if (s.length < 20 || s.length > 400 || /\s/.test(s)) throw AppError.validation("Dat ziet er niet uit als een CJ-sleutel (My CJ → Authorization → API).");
  const token = await omDeBeurt(() => nieuwToken(s));
  await kvSet(K_SLEUTEL, s);
  await kvSet(K_TOKEN, token);
  await noteer({ laatsteOk: new Date().toISOString(), laatsteFout: null, laatsteFoutOp: null });
}

/** Een geldig toegangsbewijs: uit KV, vernieuwd met de refresh, of opnieuw met de sleutel. */
export async function cjToken(): Promise<string> {
  const nu = Date.now();
  const t = await kvGet<Token>(K_TOKEN).catch(() => null);
  if (t && new Date(t.verlooptOp).getTime() - nu > 86_400_000) return t.accessToken;
  if (t?.refreshToken && t.refreshVerlooptOp && new Date(t.refreshVerlooptOp).getTime() - nu > 3_600_000) {
    try {
      const v = await omDeBeurt(() => vernieuwToken(t.refreshToken as string));
      await kvSet(K_TOKEN, v);
      return v.accessToken;
    } catch (e) {
      logger.warn("cj: vernieuwen mislukt, opnieuw met de sleutel", { error: (e as Error).message.slice(0, 120) });
    }
  }
  const sleutel = await kvGet<string>(K_SLEUTEL).catch(() => null);
  if (!sleutel) throw AppError.precondition("Er is nog geen CJ-sleutel. Plak hem in Beheer → Winkel-AI → Leverancier.");
  const n = await omDeBeurt(() => nieuwToken(sleutel));
  await kvSet(K_TOKEN, n);
  return n.accessToken;
}

/** GET op de CJ-API, met toegangsbewijs, om de beurt en met een nette fout. Geeft `data` terug. */
export async function cjGet<T>(pad: string, params: Record<string, string | number | undefined>): Promise<T> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  return cjAanvraag<T>(pad, `${BASIS}${pad}${q.size ? `?${q}` : ""}`, {});
}

/** POST op de CJ-API (JSON-body), verder als cjGet. */
export async function cjPost<T>(pad: string, body: unknown): Promise<T> {
  return cjAanvraag<T>(pad, `${BASIS}${pad}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

async function cjAanvraag<T>(pad: string, adres: string, init: { method?: string; body?: string; headers?: Record<string, string> }): Promise<T> {
  const token = await cjToken();
  return omDeBeurt(async () => {
    const res = await fetch(adres, {
      ...(init.method ? { method: init.method } : {}),
      ...(init.body !== undefined ? { body: init.body } : {}),
      headers: { ...(init.headers ?? {}), "CJ-Access-Token": token },
      signal: AbortSignal.timeout(TIJDLIMIET_MS),
    }).catch((e: unknown) => {
      throw AppError.upstream(`CJ is niet bereikbaar (${e instanceof Error ? e.name : "fout"}).`);
    });
    const d = (await res.json().catch(() => ({}))) as CjAntwoord<T>;
    if (res.status === 429) {
      await noteer({ laatsteFout: "te veel aanvragen of de dagpunten zijn op", laatsteFoutOp: new Date().toISOString() });
      throw AppError.upstream("CJ: te veel aanvragen of de punten van vandaag zijn op. Probeer het over een minuut opnieuw.");
    }
    if (!res.ok || d.result !== true || d.code !== 200 || d.data === undefined) {
      const m = typeof d.message === "string" ? d.message.slice(0, 160) : `HTTP ${res.status}`;
      await noteer({ laatsteFout: m, laatsteFoutOp: new Date().toISOString() });
      logger.warn("cj: aanvraag mislukt", { pad, status: res.status, melding: m });
      throw AppError.upstream(`CJ: ${m}`);
    }
    await noteer({ laatsteOk: new Date().toISOString() });
    return d.data;
  });
}

export interface CjZoekOpties {
  q?: string | undefined;
  categorieId?: string | undefined;
  pagina?: number | undefined;
  /** alleen producten met voorraad in dit land (bijv. "DE" voor het Europese magazijn) */
  land?: string | undefined;
  perPagina?: number | undefined;
}

/** Zoeken in de catalogus van CJ (product/list): 50 punten per aanroep. */
export async function cjZoek(o: CjZoekOpties): Promise<{ treffers: CjZoekTreffer[]; totaal: number; pagina: number }> {
  const pagina = Math.max(1, Math.round(o.pagina ?? 1));
  const d = await cjGet<{ list?: unknown; total?: unknown; pageNum?: unknown }>("product/list", {
    pageNum: pagina,
    pageSize: Math.min(50, Math.max(1, Math.round(o.perPagina ?? 20))),
    productNameEn: o.q?.trim().slice(0, 80),
    categoryId: o.categorieId,
    countryCode: o.land?.toUpperCase(),
    orderBy: "listedNum",
    sort: "desc",
  });
  const lijst = Array.isArray(d.list) ? d.list : [];
  const treffers = lijst.map(leesCjTreffer).filter((x): x is CjZoekTreffer => x !== null);
  const totaal = typeof d.total === "number" ? d.total : treffers.length;
  return { treffers, totaal, pagina };
}

/** Eén product met varianten (product/query): 10 punten. */
export async function cjProduct(pid: string): Promise<CjProduct> {
  const d = await cjGet<unknown>("product/query", { pid });
  const p = leesCjProduct(d);
  if (!p) throw AppError.upstream("CJ gaf voor dit product geen bruikbare naam, foto of prijs terug.");
  return p;
}

/**
 * Wat kost het om één stuk van deze variant naar `naar` te sturen (logistic/freightCalculate)? De goedkoopste
 * dienst telt. Null als CJ geen dienst kent of de aanvraag faalt: de aanroeper rekent dan met de schatting
 * uit de instellingen. Vanuit `van` (het magazijn: "DE" voor Europa, anders "CN").
 */
export async function cjVerzendkosten(vid: string, van: string, naar = "NL"): Promise<CjVerzending | null> {
  try {
    const d = await cjPost<unknown>("logistic/freightCalculate", {
      startCountryCode: van.toUpperCase(),
      endCountryCode: naar.toUpperCase(),
      products: [{ quantity: 1, vid }],
    });
    return goedkoopsteVerzending(d);
  } catch (e) {
    logger.warn("cj: verzendkosten niet opgehaald, schatting gebruikt", { van, naar, error: (e as Error).message.slice(0, 120) });
    return null;
  }
}

/**
 * Voorraad per variant-id voor een heel product (product/stock/getInventoryByPid): product/query geeft de
 * voorraad lang niet altijd mee, en zonder voorraad is een product in de winkel "uitverkocht". Leeg bij een fout.
 */
export async function cjVoorraadPerVariant(pid: string, land?: string): Promise<Map<string, number>> {
  try {
    const d = await cjGet<unknown>("product/stock/getInventoryByPid", { pid });
    return leesVoorraadPerVariant(d, land);
  } catch (e) {
    logger.warn("cj: voorraad niet opgehaald", { error: (e as Error).message.slice(0, 120) });
    return new Map();
  }
}

/** Voor het beheerscherm: staat er een sleutel, is het bewijs geldig, wanneer ging het voor het laatst goed of mis. */
export async function cjStand(): Promise<{ ingesteld: boolean; bewijsGeldigTot: string | null; laatsteOk: string | null; laatsteFout: string | null; laatsteFoutOp: string | null }> {
  const [ingesteld, t, s] = await Promise.all([cjSleutelIngesteld(), kvGet<Token>(K_TOKEN).catch(() => null), kvGet<Stand>(K_STAND).catch(() => null)]);
  return { ingesteld, bewijsGeldigTot: t?.verlooptOp ?? null, laatsteOk: s?.laatsteOk ?? null, laatsteFout: s?.laatsteFout ?? null, laatsteFoutOp: s?.laatsteFoutOp ?? null };
}
