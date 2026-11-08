import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type {
  DeliveryPartner,
  DeliveryPartnerStatus,
  VehicleType,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Delivery Partner Network: Partner onboarding, vehicle management,
// incentive structures, and performance tracking
// ---------------------------------------------------------------------------

export const VehicleTypeSchema = z.enum([
  "BIKE",
  "SCOOTER",
  "CAR",
  "VAN",
  "MOTORCYCLE",
  "WALKER",
]);

export type Vehicle = z.infer<typeof VehicleTypeSchema>;

// Capaciteit per voertuig (stuks per rit)
const VEHICLE_CAPACITIES: Record<Vehicle, number> = {
  BIKE: 5,
  SCOOTER: 8,
  CAR: 20,
  VAN: 50,
  MOTORCYCLE: 3,
  WALKER: 2,
};

// Verdienste per kilometer (cent)
const EARNINGS_PER_KM: Record<Vehicle, number> = {
  BIKE: 25, // €0,25 per km
  SCOOTER: 30, // €0,30 per km
  CAR: 50, // €0,50 per km
  VAN: 60, // €0,60 per km
  MOTORCYCLE: 35, // €0,35 per km
  WALKER: 20, // €0,20 per km
};

export const DeliveryPartnerStatusSchema = z.enum([
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
  "ONBOARDING",
]);

export type PartnerStatus = z.infer<typeof DeliveryPartnerStatusSchema>;

export const OnboardPartnerSchema = z.object({
  tenantId: z.string(),
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phoneNumber: z.string().regex(/^[\d\s\-\+]+$/),
  vehicleType: VehicleTypeSchema,
  vehicleLicense: z.string().optional(),
  insuranceNumber: z.string().optional(),
  bankAccount: z.string().optional(),
  commissionRate: z.number().min(0).max(50).default(10),
});

export type OnboardPartnerInput = z.infer<typeof OnboardPartnerSchema>;

export const PartnerPerformanceSchema = z.object({
  partnerId: z.string(),
  totalDeliveries: z.number().int().nonnegative(),
  completedDeliveries: z.number().int().nonnegative(),
  cancelledDeliveries: z.number().int().nonnegative(),
  averageRating: z.number().min(0).max(5),
  acceptanceRate: z.number().min(0).max(100),
  cancellationRate: z.number().min(0).max(100),
  onTimeRate: z.number().min(0).max(100),
});

export type PartnerPerformance = z.infer<typeof PartnerPerformanceSchema>;

/**
 * Onboard een nieuwe delivery partner
 */
export async function onboardDeliveryPartner(
  input: OnboardPartnerInput
): Promise<DeliveryPartner> {
  return prisma.deliveryPartner.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      email: input.email,
      phoneNumber: input.phoneNumber,
      vehicleType: input.vehicleType,
      vehicleLicense: input.vehicleLicense,
      insuranceNumber: input.insuranceNumber,
      bankAccount: input.bankAccount,
      commissionRate: input.commissionRate,
      status: "ONBOARDING",
    },
  });
}

/**
 * Activeer een partner na verificatie
 */
export async function activatePartner(partnerId: string): Promise<void> {
  await prisma.deliveryPartner.update({
    where: { id: partnerId },
    data: { status: "ACTIVE" },
  });
}

/**
 * Suspend een partner (bijv. na bezwaren over prestaties)
 */
export async function suspendPartner(
  partnerId: string,
  reason: string
): Promise<void> {
  await prisma.deliveryPartner.update({
    where: { id: partnerId },
    data: {
      status: "SUSPENDED",
    },
  });
  // TODO: Log suspension reason in audit trail
}

/**
 * Update partner service zones
 */
export async function updatePartnerServiceZones(
  partnerId: string,
  geoZoneIds: string[]
): Promise<void> {
  await prisma.deliveryPartner.update({
    where: { id: partnerId },
    data: {
      serviceZoneIds: geoZoneIds,
    },
  });
}

/**
 * Bereken verloning voor partner op basis van afstand en voertuigtype
 */
export function calculatePartnerEarnings(
  vehicleType: Vehicle,
  distanceMeters: number,
  baseDeliveryFee: number
): number {
  const distanceKm = Math.ceil(distanceMeters / 1000);
  const perKmEarnings = EARNINGS_PER_KM[vehicleType] * distanceKm;

  // Commission van delivery fee
  const commission = Math.round(baseDeliveryFee * 0.1); // 10% van fee

  return perKmEarnings + commission;
}

/**
 * Bereken voertuig-capaciteit
 */
export function getVehicleCapacity(vehicleType: Vehicle): number {
  return VEHICLE_CAPACITIES[vehicleType];
}

/**
 * Vind beschikbare partners in een gebied
 */
export async function findAvailablePartners(
  geoZoneId: string,
  vehicleType?: Vehicle,
  maxCapacityNeeded: number = 1
): Promise<DeliveryPartner[]> {
  const partners = await prisma.deliveryPartner.findMany({
    where: {
      status: "ACTIVE",
      serviceZoneIds: {
        has: geoZoneId,
      },
      ...(vehicleType && { vehicleType }),
    },
    orderBy: {
      averageRating: "desc",
    },
  });

  // Filter op voertuigcapaciteit
  return partners.filter((p) => getVehicleCapacity(p.vehicleType) >= maxCapacityNeeded);
}

/**
 * Bereken partner prestatie-score
 */
export function calculatePerformanceScore(
  performance: PartnerPerformance
): number {
  // Weighted score: 50% on-time rate, 25% cancellation rate, 25% rating
  const onTimeComponent = performance.onTimeRate * 0.5;
  const cancellationComponent = (100 - performance.cancellationRate) * 0.25;
  const ratingComponent = (performance.averageRating / 5) * 100 * 0.25;

  return Math.round(onTimeComponent + cancellationComponent + ratingComponent);
}

/**
 * Update partner rating na delivery
 */
export async function updatePartnerRating(
  partnerId: string,
  deliveryRating: number, // 1-5 stars
  isOnTime: boolean
): Promise<void> {
  const partner = await prisma.deliveryPartner.findUniqueOrThrow({
    where: { id: partnerId },
  });

  // Calculate new average
  const totalRating =
    partner.averageRating * partner.completedDeliveries + deliveryRating;
  const newAverage = totalRating / (partner.completedDeliveries + 1);

  // Update delivery count and rating
  await prisma.deliveryPartner.update({
    where: { id: partnerId },
    data: {
      completedDeliveries: {
        increment: 1,
      },
      totalDeliveries: {
        increment: 1,
      },
      averageRating: newAverage,
    },
  });
}

/**
 * Schema voor incentive-tiering
 */
export const IncentiveTierSchema = z.object({
  minDeliveries: z.number().int().min(0),
  bonus: z.number().int().min(0), // Cents
  description: z.string(),
});

export type IncentiveTier = z.infer<typeof IncentiveTierSchema>;

// Incentive tiering: hoe meer orders, hoe beter de bonus
export const INCENTIVE_TIERS: IncentiveTier[] = [
  { minDeliveries: 0, bonus: 0, description: "Baseline" },
  { minDeliveries: 10, bonus: 500, description: "10+ deliveries: +€5 per dag" },
  { minDeliveries: 25, bonus: 1250, description: "25+ deliveries: +€12,50 per dag" },
  {
    minDeliveries: 50,
    bonus: 3000,
    description: "50+ deliveries: +€30 per dag",
  },
];

/**
 * Bereken incentive bonus voor partner deze maand
 */
export async function calculateMonthlyBonus(
  partnerId: string,
  daysActiveThisMonth: number
): Promise<number> {
  const partner = await prisma.deliveryPartner.findUniqueOrThrow({
    where: { id: partnerId },
  });

  // Vind applicable tier
  let applicableTier = INCENTIVE_TIERS[0];
  for (const tier of INCENTIVE_TIERS) {
    if (partner.totalDeliveries >= tier.minDeliveries) {
      applicableTier = tier;
    }
  }

  // Calculate bonus voor actieve dagen
  return Math.round((applicableTier.bonus / 30) * daysActiveThisMonth);
}

/**
 * Schema voor batch partner upload (CSV import)
 */
export const BulkOnboardPartnersSchema = z.object({
  partners: z.array(OnboardPartnerSchema).min(1).max(1000),
});

export type BulkOnboardPartnersInput = z.infer<typeof BulkOnboardPartnersSchema>;

/**
 * Batch onboard partners
 */
export async function bulkOnboardPartners(
  input: BulkOnboardPartnersInput
): Promise<{ successful: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < input.partners.length; i++) {
    try {
      await onboardDeliveryPartner(input.partners[i]);
      successful++;
    } catch (error) {
      failed++;
      errors.push(
        `Row ${i + 1}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return { successful, failed, errors };
}

/**
 * Get partner statistics
 */
export async function getPartnerStats(
  partnerId: string
): Promise<PartnerPerformance> {
  const partner = await prisma.deliveryPartner.findUniqueOrThrow({
    where: { id: partnerId },
  });

  const completionRate =
    partner.totalDeliveries > 0
      ? (partner.completedDeliveries / partner.totalDeliveries) * 100
      : 0;
  const cancellationRate =
    partner.totalDeliveries > 0
      ? (partner.cancelledDeliveries / partner.totalDeliveries) * 100
      : 0;

  // TODO: Fetch actual on-time data from Delivery table
  const onTimeRate = 95; // Placeholder

  return {
    partnerId,
    totalDeliveries: partner.totalDeliveries,
    completedDeliveries: partner.completedDeliveries,
    cancelledDeliveries: partner.cancelledDeliveries,
    averageRating: partner.averageRating,
    acceptanceRate: completionRate,
    cancellationRate,
    onTimeRate,
  };
}
