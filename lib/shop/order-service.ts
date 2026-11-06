import { prisma } from "@/lib/prisma";
import type { PurchaseMode } from "./purchase-mode";

export interface OrderItem {
  variantId: string;
  quantity: number;
  priceCents: number;
}

export interface CreateOrderInput {
  stripeSessionId: string;
  stripePaymentId?: string;
  items: OrderItem[];
  totalCents: number;
  purchaseMode: PurchaseMode;
  customerEmail?: string;
  customerName?: string;
}

// Create a shop order record
export async function createShopOrder(input: CreateOrderInput) {
  const itemsJson = JSON.stringify(
    input.items.map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
      priceCents: i.priceCents,
    }))
  );

  // TODO: Create ShopOrder table in Prisma schema
  // For now, store in KV as backup
  const orderId = `order_${Date.now()}`;
  const order = {
    id: orderId,
    stripeSessionId: input.stripeSessionId,
    stripePaymentId: input.stripePaymentId,
    items: input.items,
    totalCents: input.totalCents,
    purchaseMode: input.purchaseMode,
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    createdAt: new Date().toISOString(),
    status: "pending" as const,
  };

  return order;
}

// Mark order as paid
export async function markOrderPaid(orderId: string, stripePaymentId: string) {
  // TODO: Update ShopOrder status to 'paid'
  // Send confirmation email
  // Trigger fulfillment
  return { ok: true, orderId };
}

// Create subscription for recurring order
export async function createSubscriptionOrder(
  orderId: string,
  stripeSubscriptionId: string
) {
  // TODO: Link subscription to order
  // Schedule recurring charges
  return { ok: true, subscriptionId: stripeSubscriptionId };
}
