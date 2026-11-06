import { getStripeClient } from "@/lib/billing/stripe";
import { createSubscriptionOrder, markOrderPaid } from "@/lib/shop/order-service";

// Stripe webhook voor shop betalingen (payment_intent.succeeded, customer.subscription.updated)

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  try {
    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_SHOP || "";

    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    if (event.type === "payment_intent.succeeded") {
      // One-time payment completed
      const paymentIntent = event.data.object as any;
      const orderId = paymentIntent.metadata?.orderId;
      if (orderId) {
        await markOrderPaid(orderId, paymentIntent.id);
      }
    } else if (event.type === "customer.subscription.created") {
      // Recurring subscription started
      const subscription = event.data.object as any;
      const orderId = subscription.metadata?.orderId;
      if (orderId) {
        await createSubscriptionOrder(orderId, subscription.id);
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
