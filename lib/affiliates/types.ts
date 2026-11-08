import { z } from "zod";

export const AffiliateSchema = z.object({
  id: z.string(),
  userId: z.string(),
  code: z.string().unique(),
  name: z.string(),
  email: z.string().email(),
  status: z.enum(["PENDING", "APPROVED", "SUSPENDED"]),
  commissionRate: z.number().min(0).max(100),
  tier: z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM"]),
  totalEarnings: z.number().default(0),
  totalConversions: z.number().default(0),
  lastPayoutAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ReferralSchema = z.object({
  id: z.string(),
  referrerId: z.string(),
  referredUserId: z.string().optional(),
  code: z.string().unique(),
  link: z.string().url(),
  status: z.enum(["ACTIVE", "CONVERTED", "EXPIRED"]),
  reward: z.number(),
  rewardType: z.enum(["CREDIT", "DISCOUNT", "CASH"]),
  expiresAt: z.date().optional(),
  convertedAt: z.date().optional(),
  claimedAt: z.date().optional(),
  createdAt: z.date(),
});

export const TrackingSchema = z.object({
  id: z.string(),
  affiliateId: z.string(),
  userId: z.string().optional(),
  trackingCode: z.string(),
  utm: z.object({
    source: z.string(),
    medium: z.string(),
    campaign: z.string(),
    content: z.string().optional(),
  }),
  deviceId: z.string(),
  firstClick: z.date(),
  lastClick: z.date(),
  converted: z.boolean(),
  conversionValue: z.number().default(0),
  commission: z.number().default(0),
  attributionModel: z.enum(["FIRST_CLICK", "LAST_CLICK", "LINEAR", "POSITION_BASED"]),
});

export const CommissionSchema = z.object({
  id: z.string(),
  affiliateId: z.string(),
  trackingId: z.string(),
  amount: z.number().positive(),
  status: z.enum(["PENDING", "APPROVED", "PAID", "DISPUTED"]),
  payoutId: z.string().optional(),
  payoutDate: z.date().optional(),
  notes: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Affiliate = z.infer<typeof AffiliateSchema>;
export type Referral = z.infer<typeof ReferralSchema>;
export type Tracking = z.infer<typeof TrackingSchema>;
export type Commission = z.infer<typeof CommissionSchema>;
