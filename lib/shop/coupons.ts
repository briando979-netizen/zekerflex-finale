// Coupon/discount codes for promotions

export type DiscountType = "percentage" | "fixed";
export type CouponStatus = "active" | "paused" | "expired";

export interface Coupon {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: number; // percentage (5 = 5%) or cents
  maxUses: number;
  usesRemaining: number;
  validFrom: Date;
  validUntil: Date;
  status: CouponStatus;
  minOrderCents?: number;
  appliesTo?: string[]; // product slugs, empty = all
}

export function validateCoupon(coupon: Coupon | null, orderCents: number): {
  valid: boolean;
  error?: string;
} {
  if (!coupon) return { valid: false, error: "Coupon niet gevonden" };
  if (coupon.status !== "active") return { valid: false, error: "Coupon is niet actief" };
  if (coupon.usesRemaining <= 0) return { valid: false, error: "Coupon is opgebruikt" };
  if (new Date() < coupon.validFrom) return { valid: false, error: "Coupon is nog niet geldig" };
  if (new Date() > coupon.validUntil) return { valid: false, error: "Coupon is verlopen" };
  if (coupon.minOrderCents && orderCents < coupon.minOrderCents) {
    return { valid: false, error: `Minimale bestelling: €${(coupon.minOrderCents / 100).toFixed(2)}` };
  }
  return { valid: true };
}

export function calculateDiscount(coupon: Coupon, orderCents: number): number {
  if (coupon.discountType === "percentage") {
    return Math.round((orderCents * coupon.discountValue) / 100);
  }
  return Math.min(coupon.discountValue, orderCents);
}

export const EXAMPLE_COUPONS: Record<string, Coupon> = {
  WELCOME10: {
    code: "WELCOME10",
    description: "10% welkomstkorting voor nieuwe klanten",
    discountType: "percentage",
    discountValue: 10,
    maxUses: 1000,
    usesRemaining: 500,
    validFrom: new Date("2026-01-01"),
    validUntil: new Date("2026-12-31"),
    status: "active",
  },
  SAVE5: {
    code: "SAVE5",
    description: "€5 korting op bestellingen boven €50",
    discountType: "fixed",
    discountValue: 500,
    maxUses: -1,
    usesRemaining: -1,
    validFrom: new Date("2025-01-01"),
    validUntil: new Date("2027-12-31"),
    status: "active",
    minOrderCents: 5000,
  },
};
