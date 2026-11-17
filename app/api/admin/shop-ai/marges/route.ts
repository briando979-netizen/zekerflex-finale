import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAccess } from "@/lib/auth/handlers";
import { kvGetMany } from "@/lib/storage/kv";
import { btwTarief } from "@/lib/shop/modus";
import { winstPerStuk, winstUitBestellingen } from "@/lib/shop/marge";
import { cjProductIds, type CjKoppeling } from "@/lib/shop/cj/importeer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** betaalkosten als % van het bedrag: overschrijving kost niets, een kaartbetaling ±1,5 % (zolang Stripe dicht is: 0) */
const BETAAL_PCT = 0;

// GET /api/admin/shop-ai/marges — per product wat één verkoop oplevert (inkoop, verzending, btw, winst) en de
// winst uit de echte, betaalde bestellingen tot nu toe. Leesbaar voor de beheerder, nooit openbaar.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [producten, bestellingen, vanCj] = await Promise.all([
    prisma.shopProduct.findMany({ select: { id: true, name: true, slug: true, category: true, priceCents: true, costCents: true, active: true, stock: true, sellerTenantId: true }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.shopOrder.findMany({ select: { status: true, itemsJson: true } }),
    cjProductIds(),
  ]);
  const koppelingen = vanCj.length ? await kvGetMany<CjKoppeling>(vanCj.map((id) => `shop:cj:product:${id}`)).catch(() => new Map<string, CjKoppeling>()) : new Map<string, CjKoppeling>();
  const verzendVan = (id: string): number => koppelingen.get(`shop:cj:product:${id}`)?.verzendCents ?? 0;
  const perId = new Map(producten.map((p) => [p.id, p]));
  const totaal = winstUitBestellingen(bestellingen, (id) => {
    const p = perId.get(id);
    return { inkoopCents: p?.costCents ?? null, verzendCents: verzendVan(id), tarief: p ? btwTarief(p) : 0.21 };
  }, BETAAL_PCT);
  const verkocht = new Map(totaal.perProduct.map((p) => [p.productId, p]));
  const regels = producten.map((p) => {
    const w = winstPerStuk(p.priceCents, p.costCents, { verzendCents: verzendVan(p.id), betaalPct: BETAAL_PCT, tarief: btwTarief(p) });
    const v = verkocht.get(p.id);
    return {
      id: p.id, naam: p.name, slug: p.slug, categorie: p.category, actief: p.active, voorraad: p.stock,
      bron: vanCj.includes(p.id) ? "cj" : p.sellerTenantId ? "verkoper" : "eigen",
      verkoopCents: p.priceCents, inkoopCents: p.costCents, verzendCents: w.verzendCents, btwCents: w.btwCents, winstCents: w.winstCents, margePct: w.margePct,
      verkochtStuks: v?.stuks ?? 0, verdiendCents: v?.winstCents ?? 0,
    };
  });
  return NextResponse.json({
    regels,
    totaal: { bestellingen: totaal.bestellingen, stuks: totaal.stuks, omzetCents: totaal.omzetCents, inkoopCents: totaal.inkoopCents, winstCents: totaal.winstCents },
    zonderInkoop: regels.filter((r) => r.actief && r.inkoopCents === null).length,
  });
});
