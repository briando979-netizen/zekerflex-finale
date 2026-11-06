// Gift subscriptions — gift a subscription to someone

export type GiftDuration = "1month" | "3months" | "6months" | "12months";

export interface GiftSubscription {
  id: string;
  giftCode: string; // Unique code to redeem
  giverEmail: string;
  giverId?: string;
  recipientEmail: string;
  subscriptionTier: "starter" | "growth" | "pro";
  duration: GiftDuration;
  message: string;
  status: "active" | "redeemed" | "expired";
  redeemedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

export function generateGiftCode(): string {
  return `GIFT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

export function getGiftMonths(duration: GiftDuration): number {
  const map: Record<GiftDuration, number> = {
    "1month": 1,
    "3months": 3,
    "6months": 6,
    "12months": 12,
  };
  return map[duration];
}

export async function redeemGift(giftCode: string, recipientId: string) {
  // TODO: Activate subscription for recipient
  // Update GiftSubscription.status = 'redeemed'
  // Create subscription for recipient
  return { ok: true, subscriptionId: "sub_xxx" };
}

export async function sendGiftEmail(gift: GiftSubscription) {
  // TODO: Send email to recipient with redemption link
}

export const GIFT_OPTIONS = [
  {
    duration: "1month" as GiftDuration,
    label: "1 maand",
    price: 999, // varies by tier
  },
  {
    duration: "3months" as GiftDuration,
    label: "3 maanden",
    price: 2399,
    savings: 10,
  },
  {
    duration: "6months" as GiftDuration,
    label: "6 maanden",
    price: 4299,
    savings: 30,
  },
  {
    duration: "12months" as GiftDuration,
    label: "12 maanden",
    price: 7799,
    savings: 95,
  },
];
