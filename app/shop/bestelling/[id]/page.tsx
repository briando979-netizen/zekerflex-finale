import type { Metadata } from "next";
import { getPrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrderTracking } from "@/components/marketing/OrderTracking";
import { bonPad, controleerBonToken } from "@/lib/shop/bon-token";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Je bestelling", robots: { index: false } };

export default async function ShopOrderPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { id } = await props.params;
  const { t } = await props.searchParams;
  const token = typeof t === "string" ? t : undefined;

  // De bon-link (PDF) krijgt alleen wie het token uit de mail heeft, of de
  // ingelogde klant die de bestelling onder zijn eigen e-mailadres deed.
  let bonUrl: string | null = null;
  if (token && controleerBonToken(id, token) === "geldig") {
    bonUrl = `/api/shop/orders/${id}/pdf?t=${encodeURIComponent(token)}`;
  } else {
    const principal = await getPrincipal().catch(() => null);
    if (principal) {
      const order = await prisma.shopOrder.findUnique({ where: { id }, select: { email: true } }).catch(() => null);
      if (order && order.email.toLowerCase() === principal.email.toLowerCase()) bonUrl = bonPad(id);
    }
  }

  return <OrderTracking orderId={id} bonUrl={bonUrl} />;
}
