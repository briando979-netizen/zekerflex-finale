import { AppError } from "@/lib/errors";
import { featureEnabled } from "@/lib/flags";
import { gebruikEigenVers } from "@/lib/gratis/keuzes";
import { fetchOfUitval, isServerFout, nietBereikbaar } from "@/lib/http/uitval";
import { logger } from "@/lib/logger";
import { fixedWindow } from "@/lib/rate-limit";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import {
  beeldenPerDag,
  categorieVoor,
  kledingLink,
  leesStatus,
  PASDIENST_HOST,
  PASDIENST_NAAM,
  STANDAARD_PLAFOND_EURO,
  verzoekLichaam,
  WACHT_MS,
} from "@/lib/shop/pasdienst-kern";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// De echte paskamer, serverkant (zie lib/shop/pasdienst-kern.ts voor het waarom). De sleutel staat verzegeld in de KV,
// zoals de Alpaca- en de Stripe-sleutel, en gaat nooit terug naar de browser, een log of de audit. Aan staat hij pas als
// alles klopt: de vlag `paskamer-echt-passen` (Beheer → Vlaggen), een sleutel, de keuze bij Alles gratis niet op
// "eigen", en het dagplafond in euro's niet bereikt. Anders blijft de paspop (onze eigen, gratis paskamer).
// Foto en beeld komen nergens terecht: niet in de KV, niet in de database, niet in een log.
// ---------------------------------------------------------------------------

export const PASDIENST_KV = "shop:pasdienst";
export const PASDIENST_VLAG = "paskamer-echt-passen";
const DOEL = "pasdienst-sleutel";

interface Opgeslagen {
  sleutel?: string; // verzegeld
  ingesteldOp?: string;
  plafondEuro?: number;
}

export interface PasdienstInfo {
  aanwezig: boolean;
  ingesteldOp: string | null;
  plafondEuro: number;
}

export async function pasdienstInfo(): Promise<PasdienstInfo> {
  const o = await kvGet<Opgeslagen>(PASDIENST_KV);
  return { aanwezig: Boolean(o?.sleutel), ingesteldOp: o?.ingesteldOp ?? null, plafondEuro: o?.plafondEuro ?? STANDAARD_PLAFOND_EURO };
}

/** Sleutel en/of dagplafond bewaren; een lege sleutel laat de oude staan. */
export async function bewaarPasdienst(invoer: { sleutel?: string; plafondEuro?: number }, nu: Date = new Date()): Promise<PasdienstInfo> {
  const oud = (await kvGet<Opgeslagen>(PASDIENST_KV)) ?? {};
  const nieuw: Opgeslagen = { ...oud };
  const s = invoer.sleutel?.trim();
  if (s) {
    nieuw.sleutel = sealSecret(s, DOEL);
    nieuw.ingesteldOp = nu.toISOString();
  }
  if (invoer.plafondEuro !== undefined) nieuw.plafondEuro = invoer.plafondEuro;
  await kvSet(PASDIENST_KV, nieuw);
  return pasdienstInfo();
}

export async function verwijderPasdienstSleutel(): Promise<void> {
  const oud = await kvGet<Opgeslagen>(PASDIENST_KV);
  if (!oud) return;
  await kvSet(PASDIENST_KV, { ...(oud.plafondEuro !== undefined ? { plafondEuro: oud.plafondEuro } : {}) });
}

/** Alleen voor het opruimen in tests en Beheer: alles weg. */
export async function wisPasdienst(): Promise<void> {
  await kvDelete(PASDIENST_KV);
}

async function leesSleutel(): Promise<string | null> {
  const o = await kvGet<Opgeslagen>(PASDIENST_KV);
  if (!o?.sleutel) return null;
  try {
    return openSecret(o.sleutel, DOEL);
  } catch {
    return null;
  }
}

export type Beschikbaar = { aan: true } | { aan: false; reden: "uit" | "geen-sleutel" | "eigen" | "plafond" };

/** Mag de echte paskamer nu? Zonder te tellen (het tellen gebeurt bij het passen zelf). */
export async function pasdienstBeschikbaar(): Promise<Beschikbaar> {
  if (!(await featureEnabled(PASDIENST_VLAG).catch(() => false))) return { aan: false, reden: "uit" };
  const info = await pasdienstInfo();
  if (!info.aanwezig) return { aan: false, reden: "geen-sleutel" };
  if (await gebruikEigenVers("pasdienst", true)) return { aan: false, reden: "eigen" };
  if (beeldenPerDag(info.plafondEuro) <= 0) return { aan: false, reden: "plafond" };
  return { aan: true };
}

/**
 * Eén beeld tellen tegen het dagplafond. Faalt dicht (niet open zoals bij inloggen): als de teller niet werkt, kost het
 * ons geld zonder grens, dus dan geen beeld maar de paspop.
 */
async function telBeeld(plafondEuro: number, nu: Date): Promise<boolean> {
  const max = beeldenPerDag(plafondEuro);
  if (max <= 0) return false;
  const r = await fixedWindow(`pasdienst:dag:${amsterdamDayKey(nu)}`, max, 26 * 3600, { failOpen: false });
  return r.ok;
}

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Laat de dienst het kledingstuk op de foto zetten. Geeft een data-URI van het beeld, of een AppError met een eerlijke
 * melding (de paskamer valt dan terug op de paspop). Niets van de foto of het beeld wordt bewaard of gelogd.
 */
export async function pasOp(
  foto: string,
  kleding: { imageUrl: string | null; category: string; name: string },
  eigenSite: string,
  nu: Date = new Date(),
): Promise<{ beeld: string }> {
  const kan = await pasdienstBeschikbaar();
  if (!kan.aan) throw new AppError("PRECONDITION_FAILED", "De echte paskamer staat nu niet aan. Gebruik de paspop.", 423, { reden: "uit" });
  const sleutel = await leesSleutel();
  if (!sleutel) throw new AppError("PRECONDITION_FAILED", "De echte paskamer staat nu niet aan. Gebruik de paspop.", 423, { reden: "uit" });
  const link = kledingLink(kleding.imageUrl, eigenSite);
  if (!link) throw AppError.validation("Van dit kledingstuk is geen foto om te passen.");
  const info = await pasdienstInfo();
  if (!(await telBeeld(info.plafondEuro, nu))) {
    throw new AppError("PRECONDITION_FAILED", "Voor vandaag zijn de echte pasbeelden op. Probeer het morgen weer, of gebruik de paspop.", 423, { reden: "plafond" });
  }

  const kop = { Authorization: `Bearer ${sleutel}`, "Content-Type": "application/json", Accept: "application/json" };
  const start = await fetchOfUitval(PASDIENST_NAAM, `https://${PASDIENST_HOST}/v1/run`, {
    method: "POST",
    headers: kop,
    body: JSON.stringify(verzoekLichaam(foto, link, categorieVoor(`${kleding.category} ${kleding.name}`))),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!start.ok) {
    // alleen de status: de body kan onze foto terugkaatsen
    logger.warn("pasdienst: starten mislukt", { status: start.status });
    if (isServerFout(start.status)) throw nietBereikbaar(PASDIENST_NAAM);
    throw AppError.validation("De pasdienst nam deze foto niet aan. Probeer een andere foto, of gebruik de paspop.");
  }
  const begin = (await start.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof begin?.id === "string" && /^[A-Za-z0-9_-]{4,80}$/.test(begin.id) ? begin.id : null;
  if (!id) throw nietBereikbaar(PASDIENST_NAAM);

  const tot = Date.now() + WACHT_MS;
  while (Date.now() < tot) {
    await wacht(1500);
    const s = await fetchOfUitval(PASDIENST_NAAM, `https://${PASDIENST_HOST}/v1/status/${id}`, { method: "GET", headers: kop, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!s.ok) {
      if (isServerFout(s.status)) continue;
      logger.warn("pasdienst: status mislukt", { status: s.status });
      throw nietBereikbaar(PASDIENST_NAAM);
    }
    const u = leesStatus(await s.json().catch(() => null));
    if (u.soort === "klaar") return { beeld: u.beeld };
    if (u.soort === "mislukt") {
      logger.warn("pasdienst: geen beeld", { reden: u.reden });
      if (u.reden === "geen-pose") throw AppError.validation("Op deze foto vinden we geen hele persoon. Kies een foto van top tot teen, van voren.");
      if (u.reden === "geweigerd") throw AppError.validation("De pasdienst wilde van deze foto geen beeld maken. Kies een andere foto.");
      throw nietBereikbaar(PASDIENST_NAAM);
    }
  }
  logger.warn("pasdienst: te lang gewacht", { grensMs: WACHT_MS });
  throw new AppError("UPSTREAM_UNAVAILABLE", "Het pasbeeld duurde te lang. Probeer het zo nog eens, of gebruik de paspop.", 504);
}
