import { createHash } from "crypto";
import { Prisma, type ShopOrder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { SITE } from "@/lib/seo";
import { featureEnabled } from "@/lib/flags";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import {
  agentRegels,
  bedragenVanSessie,
  betaalId,
  isEindstand,
  klantVanSessie,
  prijsCsv,
  productCsv,
  productRijen,
  stripeFoutNL,
  vasteVingerafdruk,
  voorraadCsv,
  wachtNaFout,
  type AgentSessie,
  type BekendeVariant,
  type CatalogusProduct,
} from "@/lib/shop/agent-handel";

// ---------------------------------------------------------------------------
// Verkopen via AI-assistenten (Stripe Agentic Commerce Suite), het deel met
// netwerk en database. Het pure deel staat in lib/shop/agent-handel.ts.
//
// Elk kwartier (cron → /api/internal/shop/agent-catalogus) kijken we of de
// productlijst veranderde. Alleen dan gaat er iets naar Stripe:
//   - titel, foto, omschrijving, maten … anders  → de hele lijst ("replace":
//     wat er niet meer in staat, haalt Stripe weg), en verder één keer per dag;
//   - alleen voorraad of prijs anders            → alleen die (inventory/pricing).
// Een bestelling via een assistent komt als checkout.session.completed binnen
// (app/api/webhooks/stripe); maakAgentBestelling maakt er een ShopOrder van.
// ---------------------------------------------------------------------------

const IMPORTS = "https://api.stripe.com/v2/commerce/product_catalog/imports";
const VERSIE_CATALOGUS = "2026-10-28.preview";
const VERSIE_SESSIE = "2025-12-15.preview";
const K_STAND = "shop:agent:stand";
const K_BESTELLING = "shop:agent:order:";
const DAG_MS = 24 * 3_600_000;

export type FeedSoort = "product" | "inventory" | "pricing";

export interface FeedStand {
  hash: string;
  importId: string;
  op: string;
  status: string;
  regels: number;
  gelukt?: number;
  fouten?: number;
  voorbeelden?: { id: string; veld: string; regel: number; bericht: string }[];
  melding?: string;
}

export interface AgentStand {
  laatsteRonde?: string;
  laatsteUitslag?: string;
  product?: FeedStand;
  inventory?: FeedStand;
  pricing?: FeedStand;
  regels?: number;
  overgeslagen?: { naam: string; reden: string }[];
  fout?: { bericht: string; op: string; pogingen: number; volgende: string };
}

export interface AgentBestellingMerk {
  orderId: string;
  sessieId: string;
  op: string;
  totaalCent: number;
}

export const agentStand = async (): Promise<AgentStand> => (await kvGet<AgentStand>(K_STAND)) ?? {};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

class StripeFout extends Error {}

/** Een verzoek aan de catalogus-API van Stripe (v2: JSON, eigen versiekop). */
async function stripeV2(pad: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<Record<string, unknown>> {
  const res = await fetch(`${IMPORTS}${pad}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": VERSIE_CATALOGUS,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const err = json?.error as { message?: string } | undefined;
    throw new StripeFout(stripeFoutNL(res.status, err?.message));
  }
  return json ?? {};
}

/** Het uploadadres dat Stripe teruggeeft; alleen van Stripe zelf (nooit loggen: het is een getekende link). */
function uploadAdres(json: Record<string, unknown>): string {
  const url = (json.status_details as { awaiting_upload?: { upload_url?: { url?: unknown } } } | undefined)?.awaiting_upload?.upload_url?.url;
  if (typeof url !== "string") throw new StripeFout("Stripe gaf geen adres om het bestand naartoe te sturen.");
  const host = new URL(url).hostname;
  if (!url.startsWith("https://") || !(host === "stripeusercontent.com" || host.endsWith(".stripeusercontent.com") || host.endsWith(".stripe.com"))) {
    throw new StripeFout(`Stripe gaf een onverwacht uploadadres (${host}).`);
  }
  return url;
}

/** Maakt een import aan bij Stripe en stuurt de CSV erheen (het adres is 5 minuten geldig). */
async function stuurFeed(soort: FeedSoort, csv: string, nu: Date): Promise<{ id: string; status: string }> {
  const stempel = nu.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const imp = await stripeV2("", {
    method: "POST",
    body: { feed_type: soort, mode: soort === "product" ? "replace" : "upsert", metadata: { file_name: `zekerflex-${soort}-${stempel}.csv`, bron: "zekerflex" } },
  });
  const url = uploadAdres(imp);
  const put = await fetch(url, { method: "PUT", headers: { "Content-Type": "text/csv" }, body: csv, signal: AbortSignal.timeout(60_000) });
  if (!put.ok) throw new StripeFout(`Het bestand kwam niet aan bij Stripe (${put.status}).`);
  return { id: String(imp.id ?? ""), status: "processing" };
}

/** Werkt de uitslag van een eerdere upload bij zolang Stripe er nog mee bezig was. */
async function werkUitslagBij(stand: FeedStand | undefined): Promise<FeedStand | undefined> {
  if (!stand?.importId || isEindstand(stand.status)) return stand;
  const imp = await stripeV2(`/${encodeURIComponent(stand.importId)}`, { method: "GET" });
  const status = typeof imp.status === "string" ? imp.status : stand.status;
  const d = (imp.status_details ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const klaar = d.succeeded ?? d.succeeded_with_errors ?? d.processing;
  const mis = d.failed;
  const voorbeelden = Array.isArray(d.succeeded_with_errors?.samples)
    ? (d.succeeded_with_errors.samples as Record<string, unknown>[]).slice(0, 10).map((s) => ({
        id: String(s.id ?? ""),
        veld: String(s.field ?? ""),
        regel: Number(s.row ?? 0),
        bericht: String(s.error_message ?? "").slice(0, 300),
      }))
    : undefined;
  return {
    ...stand,
    status,
    ...(typeof klaar?.success_count === "number" ? { gelukt: klaar.success_count } : {}),
    ...(typeof klaar?.error_count === "number" ? { fouten: klaar.error_count } : {}),
    ...(voorbeelden ? { voorbeelden } : {}),
    ...(mis ? { melding: `Stripe kon het bestand niet verwerken (${String(mis.code ?? "onbekend")}): ${String(mis.failure_message ?? "").slice(0, 300)}` } : {}),
  };
}

/** De producten zoals de productlijst ze nodig heeft. */
async function laadProducten(): Promise<CatalogusProduct[]> {
  const rijen = await prisma.shopProduct.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      category: true,
      gender: true,
      priceCents: true,
      imageUploadId: true,
      imageUrl: true,
      isBundle: true,
      active: true,
      sellerTenantId: true,
      sellerStatus: true,
      seller: { select: { name: true } },
      variants: { orderBy: { createdAt: "asc" }, select: { id: true, sku: true, size: true, color: true, priceCents: true, stock: true } },
    },
  });
  return rijen.map(({ seller, ...p }) => ({ ...p, sellerName: seller?.name ?? null }));
}

export type RondeUitslag = "uit" | "geen-sleutel" | "wacht-na-fout" | "niets-veranderd" | "productlijst" | "voorraad-en-prijs" | "fout";

/**
 * Eén ronde: uitslagen bijwerken, kijken wat er veranderde en alleen dat
 * sturen. Gooit nooit: een fout komt in de stand (Admin → Verkoop via AI) met
 * een wachttijd die steeds langer wordt.
 */
export async function synchroniseerAgentCatalogus(opties: { forceer?: boolean; nu?: Date } = {}): Promise<{ uitslag: RondeUitslag; stand: AgentStand }> {
  const nu = opties.nu ?? new Date();
  const stand = await agentStand();
  if (!(await featureEnabled("agent-winkel"))) return { uitslag: "uit", stand };
  if (!env.STRIPE_SECRET_KEY) return { uitslag: "geen-sleutel", stand };
  if (!opties.forceer && stand.fout && Date.parse(stand.fout.volgende) > nu.getTime()) return { uitslag: "wacht-na-fout", stand };

  const nieuw: AgentStand = { ...stand, laatsteRonde: nu.toISOString() };
  let uitslag: RondeUitslag = "niets-veranderd";
  try {
    // na een hele lijst delen de drie dezelfde import: één keer vragen
    const gevraagd = new Map<string, Promise<FeedStand | undefined>>();
    const bij = (s: FeedStand | undefined) => {
      if (!s?.importId) return werkUitslagBij(s);
      const eerder = gevraagd.get(s.importId);
      if (eerder) return eerder.then((u) => (u && s ? { ...s, status: u.status, ...(u.gelukt !== undefined ? { gelukt: u.gelukt } : {}), ...(u.fouten !== undefined ? { fouten: u.fouten } : {}) } : s));
      const p = werkUitslagBij(s);
      gevraagd.set(s.importId, p);
      return p;
    };
    const [product, inventory, pricing] = await Promise.all([bij(stand.product), bij(stand.inventory), bij(stand.pricing)]);
    if (product) nieuw.product = product;
    if (inventory) nieuw.inventory = inventory;
    if (pricing) nieuw.pricing = pricing;

    const { rijen, overgeslagen } = productRijen(await laadProducten(), SITE.url);
    nieuw.regels = rijen.length;
    nieuw.overgeslagen = overgeslagen;
    const vast = sha(vasteVingerafdruk(rijen));
    const voorraad = voorraadCsv(rijen);
    const prijs = prijsCsv(rijen);

    const oud = nieuw.product;
    const heleLijst =
      opties.forceer ||
      !oud ||
      oud.hash !== vast ||
      oud.status === "failed" ||
      nu.getTime() - Date.parse(oud.op) > DAG_MS;
    // Nog nooit iets gestuurd en niets om te sturen: niets doen (een lege "replace" wist alles).
    if (heleLijst && !(rijen.length === 0 && !oud)) {
      const imp = await stuurFeed("product", productCsv(rijen), nu);
      const op = nu.toISOString();
      nieuw.product = { hash: vast, importId: imp.id, op, status: imp.status, regels: rijen.length };
      // de hele lijst bevat ook de voorraad en de prijs: die zijn daarmee bij
      nieuw.inventory = { hash: sha(voorraad), importId: imp.id, op, status: imp.status, regels: rijen.length };
      nieuw.pricing = { hash: sha(prijs), importId: imp.id, op, status: imp.status, regels: rijen.length };
      uitslag = "productlijst";
    } else if (rijen.length > 0) {
      for (const [soort, csv] of [
        ["inventory", voorraad],
        ["pricing", prijs],
      ] as const) {
        const h = sha(csv);
        if (nieuw[soort]?.hash === h) continue;
        const imp = await stuurFeed(soort, csv, nu);
        nieuw[soort] = { hash: h, importId: imp.id, op: nu.toISOString(), status: imp.status, regels: rijen.length };
        uitslag = "voorraad-en-prijs";
      }
    }
    delete nieuw.fout;
  } catch (err) {
    const pogingen = (stand.fout?.pogingen ?? 0) + 1;
    const bericht = err instanceof StripeFout ? err.message : `Onverwachte fout: ${(err as Error).message}`.slice(0, 300);
    nieuw.fout = { bericht, op: nu.toISOString(), pogingen, volgende: new Date(nu.getTime() + wachtNaFout(pogingen)).toISOString() };
    uitslag = "fout";
    logger.warn("agent-catalogus: ronde mislukt", { bericht, pogingen });
  }
  nieuw.laatsteUitslag = uitslag;
  await kvSet(K_STAND, nieuw);
  return { uitslag, stand: nieuw };
}

// ---------------------------------------------------------------------------
// Bestellingen
// ---------------------------------------------------------------------------

/** De sessie met regels, prijzen (external_reference = ons variant-id) en product. */
async function haalSessie(sessieId: string): Promise<AgentSessie | null> {
  const qs = new URLSearchParams();
  qs.append("expand[]", "line_items.data.price.product");
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessieId)}?${qs}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Stripe-Version": VERSIE_SESSIE },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    logger.warn("agent-bestelling: sessie ophalen mislukt", { status: res.status, sessieId });
    return null;
  }
  return (await res.json()) as AgentSessie;
}

/**
 * Maakt van een betaalde sessie zonder onze eigen kenmerken een webshop-
 * bestelling, als (minstens één van) de regels uit onze productlijst komt.
 * Null = geen bestelling van ons. Dubbel (Stripe stuurt soms twee keer) is
 * veilig: stripeSessionId is uniek, de tweede keer krijg je { nieuw: false }.
 */
export async function maakAgentBestelling(sessieId: string): Promise<{ order: ShopOrder; nieuw: boolean } | null> {
  const bestaand = await prisma.shopOrder.findUnique({ where: { stripeSessionId: sessieId } });
  if (bestaand) return { order: bestaand, nieuw: false };
  if (!env.STRIPE_SECRET_KEY) return null;

  const sessie = await haalSessie(sessieId);
  if (!sessie) return null;
  const skus = (sessie.line_items?.data ?? []).map((r) => r.price?.external_reference).filter((s): s is string => typeof s === "string" && s.length > 0);
  if (skus.length === 0) return null;
  const varianten = await prisma.shopProductVariant.findMany({
    where: { id: { in: skus } },
    select: { id: true, size: true, color: true, product: { select: { id: true, name: true, imageUrl: true, sellerTenantId: true } } },
  });
  const regels = agentRegels(sessie, new Map<string, BekendeVariant>(varianten.map((v) => [v.id, v])));
  if (!regels) return null;

  const klant = klantVanSessie(sessie);
  const bedragen = bedragenVanSessie(sessie, regels);
  try {
    const order = await prisma.shopOrder.create({
      data: {
        status: "RECEIVED",
        ...klant,
        itemsJson: regels as unknown as Prisma.InputJsonValue,
        ...bedragen,
        stripeSessionId: sessieId,
        stripePaymentIntentId: betaalId(sessie),
      },
    });
    const merk: AgentBestellingMerk = { orderId: order.id, sessieId, op: new Date().toISOString(), totaalCent: order.totalCents };
    await kvSet(`${K_BESTELLING}${order.id}`, merk);
    return { order, nieuw: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const order = await prisma.shopOrder.findUnique({ where: { stripeSessionId: sessieId } });
      if (order) return { order, nieuw: false };
    }
    throw err;
  }
}

/** De bestellingen die via een AI-assistent binnenkwamen (nieuwste eerst). */
export async function agentBestellingen(max = 50): Promise<AgentBestellingMerk[]> {
  const lijst = await kvListValues<AgentBestellingMerk>(K_BESTELLING, 500);
  return lijst.sort((a, b) => b.op.localeCompare(a.op)).slice(0, max);
}
