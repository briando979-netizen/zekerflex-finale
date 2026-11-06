// Referral program — refer a friend

export interface ReferralCode {
  id: string;
  referrerId: string;
  code: string; // Unique ref code (e.g., BRIAND_H3X7)
  discount: number; // Discount % for referee
  referrerBonus: number; // Points/credit for referrer
  usesRemaining: number;
  createdAt: Date;
  expiresAt?: Date;
}

export interface ReferralUse {
  id: string;
  referralCodeId: string;
  refereeEmail: string;
  orderId?: string;
  bonusAwarded: boolean;
  awardedAt?: Date;
}

// Generate unique referral code
export function generateReferralCode(referrerName: string, seed: string): string {
  const truncated = referrerName.slice(0, 6).toUpperCase();
  const random = seed.slice(0, 4).toUpperCase();
  return `${truncated}_${random}`;
}

export const REFERRAL_PROGRAM = {
  refereeDiscount: 15, // 15% off first order
  referrerBonus: 2500, // 2500 points (€125)
  maxReferrals: 20, // Per referrer
  expirationDays: 90,
};

// Check if referral is valid for this order
export function isReferralValid(referral: ReferralCode, refereeEmail: string): {
  valid: boolean;
  error?: string;
} {
  if (referral.usesRemaining <= 0) return { valid: false, error: "Referral code is exhausted" };
  if (referral.expiresAt && new Date() > referral.expiresAt) {
    return { valid: false, error: "Referral code has expired" };
  }
  return { valid: true };
}
