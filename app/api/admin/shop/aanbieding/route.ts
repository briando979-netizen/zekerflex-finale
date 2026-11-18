import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { dealActief, kortingProcent } from "@/lib/shop/aanbieding";
import { historieVan, laagstePrijs30Dagen, startAanbieding, stopAanbieding } from "@/lib/shop/aanbieding-server";
import { amsterdamToUtc } from "@/lib/time/amsterdam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beheer → Webshop → een product → Aanbieding. De "van"-prijs komt uit de prijshistorie (laagste prijs van de laatste
// 30 dagen), nooit uit een invoerveld. GET: de stand van één product. POST: start. DELETE: stop.

const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

async function stand(productId: string) {
  const p = await prisma.shopProduct.findUnique({ where: { id: productId }, select: { id: true, name: true, priceCents: true, createdAt: true, dealVanCents: true, dealNormaalCents: true, dealEindigt: true } });
  if (!p) return null;
  const nu = new Date();
  const historie = await historieVan(p, nu);
  return {
    productId: p.id,
    prijsCents: p.priceCents,
    laagste30Cents: p.dealNormaalCents === null ? await laagstePrijs30Dagen(p.id, nu) : p.dealVanCents,
    /** dekt de prijshistorie het hele venster? Zo niet: de dag waarop een aanbieding wel kan (of null: nog geen prijs bekend) */
    historieVolledig: historie.dekt,
    kanVanaf: historie.vanaf?.toISOString() ?? null,
    loopt: p.dealNormaalCents !== null,
    zichtbaar: dealActief(p, nu),
    vanCents: p.dealVanCents,
    normaalCents: p.dealNormaalCents,
    eindigt: p.dealEindigt?.toISOString() ?? null,
    procent: p.dealVanCents ? kortingProcent(p.dealVanCents, p.priceCents) : 0,
  };
}

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const id = new URL(request.url).searchParams.get("productId") ?? "";
  const s = id ? await stand(id) : null;
  if (!s) return NextResponse.json({ error: { message: "Product niet gevonden." } }, { status: 404 });
  return NextResponse.json({ aanbieding: s });
});

const startSchema = z.object({
  productId: z.string().min(1).max(64),
  prijsCents: z.number().int().positive().max(1_000_000),
  /** de laatste dag van de aanbieding (YYYY-MM-DD, Nederlandse kalender); hij loopt tot en met die dag */
  totEnMet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const d = startSchema.parse(await request.json());
  const [j, m, dag] = d.totEnMet.split("-").map(Number) as [number, number, number];
  // tot en met die dag: het einde is middernacht (Amsterdam) aan het begin van de dag erna
  const erna = new Date(Date.UTC(j, m - 1, dag + 1));
  const eindigt = amsterdamToUtc(erna.getUTCFullYear(), erna.getUTCMonth() + 1, erna.getUTCDate());
  const product = await startAanbieding({ productId: d.productId, nieuwCents: d.prijsCents, eindigt });
  await recordAudit({
    category: "ADMIN",
    action: "shop.product.deal-started",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Aanbieding gestart: ${product.name}, ${euro(product.priceCents)} (van ${euro(product.dealVanCents ?? 0)}), t/m ${d.totEnMet}`,
    targetType: "shop-product",
    targetId: product.id,
  });
  return NextResponse.json({ aanbieding: await stand(product.id) });
});

export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const id = new URL(request.url).searchParams.get("productId") ?? "";
  const product = await stopAanbieding(id);
  await recordAudit({ category: "ADMIN", action: "shop.product.deal-stopped", actorUserId: principal.userId, actorLabel: "user", summary: `Aanbieding gestopt: ${product.name}, weer ${euro(product.priceCents)}`, targetType: "shop-product", targetId: product.id });
  return NextResponse.json({ aanbieding: await stand(product.id) });
});
