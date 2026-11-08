// Marketplace types and constants
export type AppStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'SUSPENDED' | 'REJECTED';
export type AppCategory = 'INTEGRATION' | 'AUTOMATION' | 'REPORTING' | 'ANALYTICS' | 'PAYMENT' | 'COMMUNICATION' | 'PRODUCTIVITY' | 'SECURITY' | 'TRAINING' | 'CUSTOM';
export type DeveloperTier = 'INDIVIDUAL' | 'STARTUP' | 'PROFESSIONAL' | 'ENTERPRISE';
export type PartnerTier = 'SILVER' | 'GOLD' | 'PLATINUM';
export type PartnerType = 'INTEGRATION' | 'RESELLER' | 'AGENCY' | 'CONSULTANT' | 'TECHNOLOGY' | 'TRAINING' | 'DATA' | 'RESEARCH';

export interface MarketplaceApp {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: AppStatus;
  category: AppCategory;
  developerTenantId: string;
  logoUrl?: string;
  bannerUrl?: string;
  version: string;
  installationCount: number;
  activeInstallations: number;
  monthlyRecurringRevenueCents: number;
  averageRating: number;
  reviewCount: number;
  isPublished: boolean;
  publishedAt?: Date;
  createdAt: Date;
}

export interface Developer {
  id: string;
  tenantId: string;
  tier: DeveloperTier;
  isCertified: boolean;
  apiCallsThisMonth: number;
  apiCallsLimit: number;
}

export interface Partner {
  id: string;
  tenantId: string;
  type: PartnerType;
  tier: PartnerTier;
  revenueSplitPercentage: number;
  ytdRevenueShareCents: number;
}

export interface AppInstallation {
  id: string;
  appId: string;
  tenantId: string;
  accessToken: string;
  scopes: string[];
  isActive: boolean;
  installationDate: Date;
  lastAccessedAt?: Date;
}

export interface AppReview {
  id: string;
  appId: string;
  tenantId: string;
  rating: number;
  title: string;
  content: string;
  isVerifiedPurchase: boolean;
  createdAt: Date;
}

export const REVENUE_SHARE_RATES = {
  INDIVIDUAL: 0.7,
  STARTUP: 0.72,
  PROFESSIONAL: 0.75,
  ENTERPRISE: 0.78,
};

export const PARTNER_RATES = {
  SILVER: 0.1,
  GOLD: 0.2,
  PLATINUM: 0.3,
};
