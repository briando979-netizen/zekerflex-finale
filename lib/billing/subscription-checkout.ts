import Stripe from "stripe";

// Create a subscription or one-time checkout session based on purchase mode.
// For subscriptions: recurring product in Stripe. For one-time: simple charge.

export async function createCheckoutSession(
  stripe: Stripe,
  params: {
    customer?: string;
    productName: string;
    priceCents: number; // total or monthly
    mode: "onetime" | "subscription";
    billingCycle?: "monthly" | "annual";
    successUrl: string;
    cancelUrl: string;
  }
): Promise<string> {
  const { customer, productName, priceCents, mode, billingCycle, successUrl, cancelUrl } = params;

  if (mode === "onetime") {
    // Regular one-time payment
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "ideal"],
      mode: "payment",
      customer,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: productName },
            unit_amount: priceCents,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return session.id;
  } else {
    // Subscription mode
    const interval = billingCycle === "annual" ? "year" : "month";
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "ideal"],
      mode: "subscription",
      customer,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: productName },
            unit_amount: priceCents,
            recurring: { interval, interval_count: 1 },
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return session.id;
  }
}
