import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAID_STATUSES = ["RECEIVED", "CONFIRMED", "SHIPPED"] as const;

interface OrderLine {
  productId?: string;
  name: string;
  priceCents: number;
  qty: number;
}

// GET /api/shop/stats — echte verkoopcijfers voor het admin-dashboard: omzet
// en orderaantallen komen rechtstreeks uit ShopOrder, top-producten worden in
// JS opgeteld uit itemsJson (geen aparte orderregel-tabel om op te joinen),
// en lage voorraad leest de echte ShopProductVariant-rijen.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [paidOrders, pendingCount, allOrders, lowStock] = await Promise.all([
    prisma.shopOrder.findMany({
      where: { status: { in: [...PAID_STATUSES] } },
      select: { totalCents: true, itemsJson: true, createdAt: true },
    }),
    prisma.shopOrder.count({ where: { status: "PENDING_PAYMENT" } }),
    prisma.shopOrder.count(),
    prisma.shopProductVariant.findMany({
      where: { stock: { lte: 5 }, product: { active: true } },
      select: { id: true, size: true, color: true, stock: true, product: { select: { name: true, slug: true } } },
      orderBy: { stock: "asc" },
      take: 20,
    }),
  ]);

  const revenueCents = paidOrders.reduce((s, o) => s + o.totalCents, 0);

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const revenue30dCents = paidOrders
    .filter((o) => o.createdAt >= since30d)
    .reduce((s, o) => s + o.totalCents, 0);

  const productTotals = new Map<string, { name: string; qty: number; revenueCents: number }>();
  for (const order of paidOrders) {
    const lines = (order.itemsJson as OrderLine[] | null) ?? [];
    for (const line of lines) {
      const key = line.productId ?? line.name;
      const prev = productTotals.get(key) ?? { name: line.name, qty: 0, revenueCents: 0 };
      prev.qty += line.qty;
      prev.revenueCents += line.priceCents * line.qty;
      productTotals.set(key, prev);
    }
  }
  const topProducts = [...productTotals.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);

  return NextResponse.json({
    revenueCents,
    revenue30dCents,
    paidOrderCount: paidOrders.length,
    pendingOrderCount: pendingCount,
    totalOrderCount: allOrders,
    topProducts,
    lowStock: lowStock.map((v) => ({
      variantId: v.id,
      productName: v.product.name,
      slug: v.product.slug,
      size: v.size,
      color: v.color,
      stock: v.stock,
    })),
  });
});
