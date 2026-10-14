import type { Metadata } from "next";
import { OrderTracking } from "@/components/marketing/OrderTracking";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Je bestelling", robots: { index: false } };

export default async function ShopOrderPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <OrderTracking orderId={id} />;
}
