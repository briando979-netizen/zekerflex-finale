import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvGet, kvGetMany, kvListValues, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import {
  isPartnerCode,
  maakPartnerCode,
  partnerStatus,
  partnerVergoedingCents,
  type PartnerStatus,
  type ShopOrderStatusLike,
} from "@/lib/shop/partner-core";

// ---------------------------------------------------------------------------
// Partnerprogramma: opslag (de regels staan in lib/shop/partner-core.ts).
//   shop-partner:<code>              → { tenantId }      wie hoort bij een code
//   shop-partner-tenant:<tenantId>   → code              de code van een bedrijf
//   shop-partner-order:<tenantId>:<orderId> → PartnerOrder  vastgelegd bij bestellen
//   shop-partner-klik:<tenantId>:<dag> (Redis-hash)    klikken per dag, per product
// De stand (wacht/verdiend/vast/…) wordt telkens van de bestelling zelf afgeleid,
// dus een annulering of terugbetaling werkt vanzelf door. Geen cookies: de
// shop onthoudt de partner alleen in het tabblad (sessionStorage).
// ---------------------------------------------------------------------------

export interface PartnerOrder {
  orderId: string;
  tenantId: string;
  code: string;
  /** producten incl. btw, zonder verzending */
  productenCents: number;
  vergoedingCents: number;
  regels: number;
  at: string;
  /** gezet door de beheerder bij het uitbetalen */
  uitbetaaldOp?: string | undefined;
}

const codeKey = (code: string) => `shop-partner:${code}`;
const tenantKey = (tenantId: string) => `shop-partner-tenant:${tenantId}`;
const orderKey = (tenantId: string, orderId: string) => `shop-partner-order:${tenantId}:${orderId}`;
const klikKey = (tenantId: string, day: string) => `shop-partner-klik:${tenantId}:${day}`;
const KLIK_BEWAAR_SECONDEN = 400 * 86_400;

/** De partnercode van een bedrijf; wordt bij de eerste vraag gemaakt. */
export async function partnerCodeVoor(tenantId: string): Promise<string> {
  const bestaand = await kvGet<string>(tenantKey(tenantId));
  if (bestaand && isPartnerCode(bestaand)) return bestaand;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  for (let poging = 0; poging < 5; poging++) {
    const code = maakPartnerCode(tenant?.name ?? "partner", randomBytes(3).toString("hex"));
    if (await kvGet(codeKey(code))) continue;
    await kvSet(codeKey(code), { tenantId });
    await kvSet(tenantKey(tenantId), code);
    return code;
  }
  throw new Error("Kon geen vrije partnercode maken");
}

export async function tenantVanCode(code: unknown): Promise<string | null> {
  if (!isPartnerCode(code)) return null;
  const hit = await kvGet<{ tenantId: string }>(codeKey(code));
  return hit?.tenantId ?? null;
}

/** Tel een klik op een partnerlink (geen gegevens over de bezoeker). Faalt stil: een link moet altijd werken. */
export async function telPartnerKlik(tenantId: string, productSlug: string | null, now = new Date()): Promise<void> {
  try {
    const { redis } = await import("@/lib/redis");
    const k = klikKey(tenantId, amsterdamDayKey(now));
    await redis.multi().hincrby(k, "k", 1).hincrby(k, `p:${(productSlug ?? "shop").slice(0, 80)}`, 1).expire(k, KLIK_BEWAAR_SECONDEN).exec();
  } catch (err) {
    logger.warn("partner click not counted", { error: (err as Error).message });
  }
}

/** Klikken van de laatste `dagen` dagen, bij elkaar opgeteld. */
export async function partnerKlikken(tenantId: string, dagen: number, now = new Date()): Promise<number> {
  try {
    const { redis } = await import("@/lib/redis");
    const pipe = redis.pipeline();
    for (let i = 0; i < dagen; i++) pipe.hget(klikKey(tenantId, amsterdamDayKey(now.getTime() - i * 86_400_000)), "k");
    const res = (await pipe.exec()) ?? [];
    return res.reduce((s, [err, v]) => s + (err ? 0 : Number(v ?? 0) || 0), 0);
  } catch {
    return 0;
  }
}

/**
 * Leg bij een nieuwe bestelling vast dat hij via een partner kwam. Niet als de
 * besteller zelf bij dat bedrijf hoort (geen vergoeding op eigen aankopen).
 */
export async function legPartnerBestellingVast(input: {
  code: unknown;
  orderId: string;
  email: string;
  productenCents: number;
  regels: number;
}): Promise<PartnerOrder | null> {
  const tenantId = await tenantVanCode(input.code);
  if (!tenantId || !isPartnerCode(input.code)) return null;
  const eigen = await prisma.membership.findFirst({
    where: { tenantId, user: { email: { equals: input.email.trim(), mode: "insensitive" } } },
    select: { id: true },
  });
  if (eigen) return null;
  const rec: PartnerOrder = {
    orderId: input.orderId,
    tenantId,
    code: input.code,
    productenCents: input.productenCents,
    vergoedingCents: partnerVergoedingCents(input.productenCents),
    regels: input.regels,
    at: new Date().toISOString(),
  };
  await kvSet(orderKey(tenantId, input.orderId), rec);
  return rec;
}

export interface PartnerRij extends PartnerOrder {
  status: PartnerStatus;
}

/** Alle partnerbestellingen van een bedrijf met hun actuele stand, nieuwste eerst. */
export async function partnerBestellingen(tenantId: string, now = new Date()): Promise<PartnerRij[]> {
  const recs = await kvListValues<PartnerOrder>(`shop-partner-order:${tenantId}:`, 2000);
  if (recs.length === 0) return [];
  const orders = await prisma.shopOrder.findMany({
    where: { id: { in: recs.map((r) => r.orderId) } },
    select: { id: true, status: true, createdAt: true },
  });
  const byId = new Map(orders.map((o) => [o.id, o]));
  return recs
    .map((r) => {
      const o = byId.get(r.orderId);
      const status: PartnerStatus = o ? partnerStatus({ status: o.status as ShopOrderStatusLike, createdAt: o.createdAt }, Boolean(r.uitbetaaldOp), now) : "vervallen";
      return { ...r, status };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export interface PartnerRekening {
  iban: string;
  tenaamstelling: string;
  op: string;
}
const rekeningKey = (tenantId: string) => `shop-partner-rekening:${tenantId}`;

export const partnerRekening = (tenantId: string) => kvGet<PartnerRekening>(rekeningKey(tenantId));

export async function bewaarPartnerRekening(tenantId: string, iban: string, tenaamstelling: string): Promise<PartnerRekening> {
  const rec: PartnerRekening = { iban: iban.replace(/\s+/g, "").toUpperCase(), tenaamstelling: tenaamstelling.trim().slice(0, 70), op: new Date().toISOString() };
  await kvSet(rekeningKey(tenantId), rec);
  return rec;
}

export interface PartnerOverzicht {
  tenantId: string;
  bedrijf: string;
  code: string | null;
  rekening: PartnerRekening | null;
  rijen: PartnerRij[];
}

/** Voor het beheer: alle bedrijven met partnerbestellingen, met hun stand. */
export async function allePartners(now = new Date()): Promise<PartnerOverzicht[]> {
  const recs = await kvListValues<PartnerOrder>("shop-partner-order:", 5000);
  const tenantIds = [...new Set(recs.map((r) => r.tenantId))];
  if (tenantIds.length === 0) return [];
  const [tenants, rijenPer] = await Promise.all([
    prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }),
    Promise.all(tenantIds.map(async (id) => [id, await partnerBestellingen(id, now)] as const)),
  ]);
  const naam = new Map(tenants.map((t) => [t.id, t.name]));
  const codes = await kvGetMany<string>(tenantIds.map(tenantKey));
  const rekeningen = await kvGetMany<PartnerRekening>(tenantIds.map(rekeningKey));
  return rijenPer.map(([tenantId, rijen]) => ({
    tenantId,
    bedrijf: naam.get(tenantId) ?? "Onbekend bedrijf",
    code: codes.get(tenantKey(tenantId)) ?? null,
    rekening: rekeningen.get(rekeningKey(tenantId)) ?? null,
    rijen,
  }));
}

/** Voor het beheer: markeer vergoedingen als uitbetaald. */
export async function markeerUitbetaald(tenantId: string, orderIds: string[], op = new Date()): Promise<number> {
  const keys = orderIds.map((id) => orderKey(tenantId, id));
  const recs = await kvGetMany<PartnerOrder>(keys);
  let n = 0;
  for (const [k, rec] of recs) {
    if (rec.uitbetaaldOp) continue;
    await kvSet(k, { ...rec, uitbetaaldOp: op.toISOString() });
    n += 1;
  }
  return n;
}
