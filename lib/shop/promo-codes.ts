// Promotional and discount codes

export interface PromoCode {
  id: string;
  code: string;
  type: "percentage" | "fixed" | "free_shipping" | "free_product";
  value: number; // percentage (5-100) or cents (fixed)
  maxUses: number;
  usedCount: number;
  minOrderCents?: number;
  maxDiscountCents?: number;
  validFrom: Date;
  validUntil: Date;
  applicableProducts?: string[]; // product IDs, empty = all
  active: boolean;
  description?: string;
}

export function generatePromoCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createPromoCode(data: Partial<PromoCode>): Promise<PromoCode> {
  const now = new Date();
  return {
    id: `promo_${Date.now()}`,
    code: data.code || generatePromoCode(),
    type: data.type || "percentage",
    value: data.value || 0,
    maxUses: data.maxUses || -1, // -1 = unlimited
    usedCount: 0,
    validFrom: data.validFrom || now,
    validUntil: data.validUntil || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    active: true,
    ...data,
  };
}

export function validatePromoCode(code: PromoCode, orderCents: number): { valid: boolean; error?: string } {
  if (!code.active) return { valid: false, error: "Promotie is niet actief" };
  if (code.usedCount >= code.maxUses && code.maxUses > 0) {
    return { valid: false, error: "Promotie is uitgeput" };
  }
  if (new Date() < code.validFrom) {
    return { valid: false, error: "Promotie is nog niet van kracht" };
  }
  if (new Date() > code.validUntil) {
    return { valid: false, error: "Promotie is verlopen" };
  }
  if (code.minOrderCents && orderCents < code.minOrderCents) {
    return { valid: false, error: `Minimaal €${(code.minOrderCents / 100).toFixed(2)} bestellen` };
  }
  return { valid: true };
}

export function calculateDiscount(code: PromoCode, orderCents: number): number {
  if (code.type === "fixed") {
    const discount = Math.min(code.value, orderCents);
    return code.maxDiscountCents ? Math.min(discount, code.maxDiscountCents) : discount;
  }
  if (code.type === "percentage") {
    const discount = Math.floor((orderCents * code.value) / 100);
    return code.maxDiscountCents ? Math.min(discount, code.maxDiscountCents) : discount;
  }
  return 0;
}

export const EXAMPLE_PROMOS: Partial<PromoCode>[] = [
  {
    code: "WELCOME10",
    type: "percentage",
    value: 10,
    description: "10% korting voor nieuwe klanten",
    maxUses: 1000,
  },
  {
    code: "SUMMER20",
    type: "percentage",
    value: 20,
    description: "Zomerkortingsweek",
    maxUses: -1,
  },
  {
    code: "FREESHIP",
    type: "free_shipping",
    value: 0,
    description: "Gratis verzending",
  },
];
