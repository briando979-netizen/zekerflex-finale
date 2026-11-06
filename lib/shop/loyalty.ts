// Loyalty points & rewards program

export interface LoyaltyAccount {
  customerId: string;
  pointsBalance: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  joinedAt: Date;
}

export interface PointsTransaction {
  id: string;
  customerId: string;
  type: "earn" | "redeem" | "bonus" | "expire";
  points: number;
  description: string;
  createdAt: Date;
}

// Earning rules: 1 point per €1 spent
export function calculatePointsEarned(amountCents: number, multiplier: number = 1): number {
  return Math.floor((amountCents / 100) * multiplier);
}

// Loyalty tiers
export const LOYALTY_TIERS = {
  bronze: { minPoints: 0, multiplier: 1.0, benefits: ["1 pt per €1", "Birthday bonus"] },
  silver: { minPoints: 500, multiplier: 1.25, benefits: ["1.25 pt per €1", "Free shipping"] },
  gold: { minPoints: 2000, multiplier: 1.5, benefits: ["1.5 pt per €1", "Priority support"] },
  platinum: { minPoints: 5000, multiplier: 2.0, benefits: ["2 pt per €1", "VIP events"] },
};

// Redemption values: 100 points = €5 discount
export const POINTS_TO_EUROS = 20; // points per euro

export function pointsToDiscount(points: number): number {
  return Math.floor((points / POINTS_TO_EUROS) * 100); // in cents
}

export function calculateTier(
  points: number
): "bronze" | "silver" | "gold" | "platinum" {
  if (points >= 5000) return "platinum";
  if (points >= 2000) return "gold";
  if (points >= 500) return "silver";
  return "bronze";
}
