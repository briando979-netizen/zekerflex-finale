// API access tiers and rate limiting

export interface APITier {
  id: string;
  name: string;
  monthlyPrice: number; // cents
  rateLimit: number; // requests per minute
  maxRequests: number; // per month
  features: string[];
  supportLevel: "email" | "priority" | "dedicated";
}

export interface APIKey {
  id: string;
  name: string;
  key: string; // hashed for storage
  tierId: string;
  customerId: string;
  active: boolean;
  lastUsed?: Date;
  createdAt: Date;
}

export const API_TIERS: APITier[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    rateLimit: 10,
    maxRequests: 10000,
    features: ["Read products", "List orders", "Webhooks"],
    supportLevel: "email",
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 9900,
    rateLimit: 100,
    maxRequests: 100000,
    features: [
      "All Free features",
      "Create/update products",
      "Manage orders",
      "Analytics API",
      "Batch operations",
    ],
    supportLevel: "priority",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: 29900,
    rateLimit: 1000,
    maxRequests: 1000000,
    features: [
      "All Pro features",
      "Custom integrations",
      "Dedicated support",
      "SLA guarantee",
      "Custom rate limits",
    ],
    supportLevel: "dedicated",
  },
];

export async function createAPIKey(
  customerId: string,
  tierId: string,
  name: string
): Promise<APIKey> {
  return {
    id: `key_${Date.now()}`,
    name,
    key: `sk_${Math.random().toString(36).slice(7)}`,
    tierId,
    customerId,
    active: true,
    createdAt: new Date(),
  };
}

export async function validateAPIKey(key: string): Promise<APIKey | null> {
  // TODO: Validate and return key with rate limit info
  return null;
}
