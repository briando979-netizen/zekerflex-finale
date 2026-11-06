import { getStripeClient } from "@/lib/billing/stripe";
import { createCheckoutSession } from "@/lib/billing/subscription-checkout";
import { type PurchaseMode } from "@/lib/shop/purchase-mode";

interface CheckoutRequest {
  items: Array<{ variantId: string; quantity: number; priceCents: number }>;
  purchaseMode: PurchaseMode;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckoutRequest;
    const { items, purchaseMode, successUrl, cancelUrl, customerEmail } = body;

    if (!items.length) {
      return Response.json({ error: "Winkelwagen leeg" }, { status: 400 });
    }

    const stripe = getStripeClient();
    const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);

    // Create checkout session with purchase mode
    const sessionId = await createCheckoutSession(stripe, {
      productName: `ZekerFlex Shop (${items.length} artikel)`,
      priceCents: totalCents,
      mode: purchaseMode,
      billingCycle: purchaseMode === "subscription" ? "monthly" : undefined,
      successUrl,
      cancelUrl,
    });

    return Response.json({ sessionId, url: `https://checkout.stripe.com/pay/${sessionId}` });
  } catch (error) {
    console.error("Checkout error:", error);
    return Response.json(
      { error: "Checkout kon niet worden gestart" },
      { status: 500 }
    );
  }
}
