// Affiliate and partner program

export interface Affiliate {
  id: string;
  name: string;
  email: string;
  website?: string;
  commissionRate: number; // percentage (5-25)
  status: "active" | "pending" | "suspended" | "inactive";
  affiliateCode: string;
  totalEarnings: number; // cents
  pendingPayouts: number; // cents
  referrals: number;
  conversions: number;
  createdAt: Date;
}

export interface AffiliateLink {
  id: string;
  affiliateId: string;
  code: string;
  utmSource: string;
  clicks: number;
  conversions: number;
  revenue: number; // cents
  commission: number; // cents
  createdAt: Date;
}

export interface AffiliateCommission {
  id: string;
  affiliateId: string;
  amount: number; // cents
  orderId?: string;
  status: "pending" | "approved" | "paid";
  paidDate?: Date;
  createdAt: Date;
}

export async function createAffiliate(data: Partial<Affiliate>): Promise<Affiliate> {
  const code = `aff_${Math.random().toString(36).slice(7).toUpperCase()}`;
  return {
    id: `partner_${Date.now()}`,
    name: data.name || "",
    email: data.email || "",
    commissionRate: data.commissionRate || 10,
    status: "pending",
    affiliateCode: code,
    totalEarnings: 0,
    pendingPayouts: 0,
    referrals: 0,
    conversions: 0,
    createdAt: new Date(),
    ...data,
  };
}

export function calculateCommission(saleAmount: number, rate: number): number {
  return Math.floor((saleAmount * rate) / 100);
}

export async function trackAffiliateClick(code: string): Promise<void> {
  // TODO: Log click in database with session ID
  console.log(`[Affiliate] Click tracked for code: ${code}`);
}

export async function trackAffiliateConversion(
  code: string,
  orderId: string,
  amount: number
): Promise<AffiliateCommission | null> {
  // TODO: Log conversion, calculate commission, store payout
  return null;
}

export const DEFAULT_COMMISSION_RATE = 10; // percent
export const MAX_COMMISSION_RATE = 25; // percent
export const MIN_COMMISSION_RATE = 5; // percent
