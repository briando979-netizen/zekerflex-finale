// Testing utilities for shop features

export const MOCK_DATA = {
  customers: [
    {
      id: "cust_test_1",
      email: "test@example.com",
      name: "Test User",
      stripeId: "cus_test_1",
    },
  ],
  subscriptions: [
    {
      id: "sub_test_1",
      stripeId: "sub_stripe_1",
      customerId: "cust_test_1",
      tier: "growth",
      monthlyPriceCents: 999,
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  ],
  orders: [
    {
      id: "order_test_1",
      customerId: "cust_test_1",
      items: [{ name: "Test Product", quantity: 1, priceCents: 2999 }],
      totalCents: 2999,
      purchaseMode: "onetime" as const,
      status: "paid",
      createdAt: new Date(),
    },
  ],
  coupons: [
    {
      code: "TEST10",
      discountType: "percentage" as const,
      discountValue: 10,
      usesRemaining: 100,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      status: "active" as const,
      maxUses: 100,
    },
  ],
};

// Helper to create test stripe session
export function createMockStripeSession(params: {
  customer: string;
  items: any[];
  mode: "payment" | "subscription";
}) {
  return {
    id: `cs_test_${Math.random().toString(36).slice(7)}`,
    object: "checkout.session",
    customer: params.customer,
    mode: params.mode,
    payment_status: "unpaid",
    url: "https://checkout.stripe.com/pay/mock",
  };
}

// Test data builders
export function buildOrder(overrides?: Partial<any>) {
  return {
    id: `order_${Date.now()}`,
    customerId: "cust_test",
    totalCents: 2999,
    purchaseMode: "onetime" as const,
    status: "paid" as const,
    createdAt: new Date(),
    ...overrides,
  };
}

export function buildSubscription(overrides?: Partial<any>) {
  return {
    id: `sub_${Date.now()}`,
    stripeId: `stripe_${Date.now()}`,
    customerId: "cust_test",
    tier: "growth",
    monthlyPriceCents: 999,
    status: "active" as const,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}
