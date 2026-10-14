import type { Metadata } from "next";
import { getPrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ShopAccount, type ShopAccountOrder } from "@/components/marketing/ShopAccount";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mijn account — ZekerFlex Shop", robots: { index: false } };

// Losstaand van het werk-dashboard (/dashboard) — de shop is gast-checkout,
// dus een ingelogde bezoeker krijgt hier zijn shop-bestelgeschiedenis
// (gekoppeld op e-mailadres, er is geen aparte account-koppeling nodig) en
// zijn favorieten, niet zijn diensten/uren/klussen.
export default async function ShopAccountPage() {
  const principal = await getPrincipal();

  let orders: ShopAccountOrder[] = [];
  if (principal) {
    const rows = await prisma.shopOrder.findMany({
      where: { email: principal.email },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, status: true, totalCents: true, itemsJson: true, createdAt: true },
    });
    orders = rows.map((o) => ({
      id: o.id,
      status: o.status,
      totalCents: o.totalCents,
      itemCount: Array.isArray(o.itemsJson)
        ? (o.itemsJson as { qty?: number }[]).reduce((s, l) => s + (l.qty ?? 0), 0)
        : 0,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  return (
    <ShopAccount
      principal={principal ? { fullName: principal.fullName, email: principal.email } : null}
      orders={orders}
    />
  );
}
