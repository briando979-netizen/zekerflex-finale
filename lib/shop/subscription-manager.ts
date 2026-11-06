// Customer subscription management — upgrade, downgrade, cancel, view

export interface SubscriptionStatus {
  id: string;
  stripeId: string;
  productName: string;
  monthlyPriceCents: number;
  status: "active" | "past_due" | "canceled" | "paused";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  nextBillingAt: Date;
}

export interface Order {
  id: string;
  createdAt: Date;
  totalCents: number;
  items: Array<{ name: string; quantity: number; priceCents: number }>;
  status: "pending" | "paid" | "shipped" | "delivered";
  purchaseMode: "onetime" | "subscription";
  invoiceUrl?: string;
}

export interface CustomerAccount {
  email: string;
  subscriptions: SubscriptionStatus[];
  recentOrders: Order[];
  totalSpentCents: number;
  nextChargeAt?: Date;
}

// Get customer's active subscriptions
export async function getCustomerSubscriptions(stripeCustomerId: string) {
  // TODO: Fetch from Stripe API
  // stripe.subscriptions.list({ customer: stripeCustomerId })
  return [] as SubscriptionStatus[];
}

// Get customer's order history
export async function getCustomerOrders(customerId: string) {
  // TODO: Query ShopOrder table
  return [] as Order[];
}

// Cancel subscription
export async function cancelSubscription(subscriptionId: string, immediate: boolean = false) {
  // TODO: Call stripe.subscriptions.del() with at_period_end
  return { ok: true, canceledAt: new Date() };
}

// Upgrade subscription to higher price
export async function upgradeSubscription(subscriptionId: string, newPriceCents: number) {
  // TODO: stripe.subscriptions.update() with new price_data
  return { ok: true, newPrice: newPriceCents };
}

// Pause subscription
export async function pauseSubscription(subscriptionId: string) {
  // TODO: stripe.subscriptions.update() with pause_collection
  return { ok: true, pausedAt: new Date() };
}

// Resume paused subscription
export async function resumeSubscription(subscriptionId: string) {
  // TODO: stripe.subscriptions.update() removing pause_collection
  return { ok: true, resumedAt: new Date() };
}
