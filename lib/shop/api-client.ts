// API client for shop operations (for frontend, SDKs, partners)

export class ShopAPIClient {
  constructor(
    private baseUrl: string = "/api/shop",
    private apiKey?: string
  ) {}

  // Subscriptions
  async getSubscriptions(customerId: string) {
    return this.get(`/subscriptions?customer=${customerId}`);
  }

  async cancelSubscription(subscriptionId: string, immediate: boolean = false) {
    return this.post(`/subscriptions/${subscriptionId}/cancel`, { immediate });
  }

  async upgradeSubscription(subscriptionId: string, newTier: string) {
    return this.post(`/subscriptions/${subscriptionId}/upgrade`, { tier: newTier });
  }

  async pauseSubscription(subscriptionId: string) {
    return this.post(`/subscriptions/${subscriptionId}/pause`, {});
  }

  async resumeSubscription(subscriptionId: string) {
    return this.post(`/subscriptions/${subscriptionId}/resume`, {});
  }

  // Orders
  async getOrders(customerId: string, limit: number = 50) {
    return this.get(`/orders?customer=${customerId}&limit=${limit}`);
  }

  async getOrder(orderId: string) {
    return this.get(`/orders/${orderId}`);
  }

  // Coupons
  async validateCoupon(code: string, orderCents: number) {
    return this.post(`/coupons/validate`, { code, orderCents });
  }

  // Loyalty
  async getPoints(customerId: string) {
    return this.get(`/loyalty/points?customer=${customerId}`);
  }

  async redeemPoints(customerId: string, points: number) {
    return this.post(`/loyalty/redeem`, { customerId, points });
  }

  // Checkout
  async createCheckout(items: any[], mode: "onetime" | "subscription") {
    return this.post(`/checkout`, { items, mode });
  }

  // Invoices
  async getInvoice(invoiceId: string) {
    return this.get(`/invoices/${invoiceId}`);
  }

  async downloadInvoice(invoiceId: string) {
    return this.get(`/invoices/${invoiceId}/pdf`);
  }

  // Helpers
  private async get(path: string) {
    return this.request("GET", path);
  }

  private async post(path: string, data: any) {
    return this.request("POST", path, data);
  }

  private async request(method: string, path: string, data?: any) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return response.json();
  }
}
