import { prisma } from "@/lib/prisma";

/**
 * Calculate commission using Model A (percentage-based)
 * @param partnerId User ID of the partner
 * @param periodStart Start date of the period
 * @param periodEnd End date of the period
 */
export async function calculateCommissionModelA(
  partnerId: string,
  periodStart: Date,
  periodEnd: Date
) {
  // Get partner profile
  const profile = await prisma.salesPartnerProfile.findUnique({
    where: { userId: partnerId },
  });

  if (!profile || !profile.commissionRate) {
    return 0;
  }

  // Get approved businesses for this partner in this period
  const approvedBusinesses = await prisma.salesPartnerBusiness.findMany({
    where: {
      partnerId,
      status: "APPROVED",
      approvedAt: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
  });

  // Calculate total commission based on estimated deal value
  // Assuming each approved business is worth approximately €5,000 average deal value
  const ESTIMATED_DEAL_VALUE = 500000; // 5000 EUR in cents
  const totalDealValue = approvedBusinesses.length * ESTIMATED_DEAL_VALUE;
  const commissionAmount = Math.round((totalDealValue * profile.commissionRate) / 100);

  return commissionAmount;
}

/**
 * Calculate commission using Model B (fixed fee per business)
 * @param partnerId User ID of the partner
 */
export async function calculateCommissionModelB(partnerId: string) {
  // Fixed fee per approved business: €150
  const FIXED_FEE_PER_BUSINESS = 15000; // 150 EUR in cents

  // Get approved businesses that haven't been paid yet
  const approvedBusinesses = await prisma.salesPartnerBusiness.findMany({
    where: {
      partnerId,
      status: "APPROVED",
      commissionCents: null, // Not yet paid
    },
  });

  const commissionAmount = approvedBusinesses.length * FIXED_FEE_PER_BUSINESS;

  return commissionAmount;
}

/**
 * Process monthly commission for a partner
 */
export async function processMonthlyCommission(
  partnerId: string,
  year: number,
  month: number
) {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0);

  const profile = await prisma.salesPartnerProfile.findUnique({
    where: { userId: partnerId },
  });

  if (!profile) {
    throw new Error("Partner profiel niet gevonden");
  }

  let amountCents = 0;

  if (profile.commissionModel === "model_a") {
    amountCents = await calculateCommissionModelA(partnerId, periodStart, periodEnd);
  } else if (profile.commissionModel === "model_b") {
    amountCents = await calculateCommissionModelB(partnerId);
  }

  // Calculate deductions
  const platformFeeCents = Math.round(amountCents * 0.05); // 5% platform fee
  const taxesCents = Math.round(amountCents * 0.19); // 19% VAT/taxes
  const netAmountCents = amountCents - platformFeeCents - taxesCents;

  // Create or update commission record
  const commission = await prisma.salesPartnerCommission.upsert({
    where: {
      partnerId_periodStart_periodEnd: {
        partnerId,
        periodStart,
        periodEnd,
      },
    },
    create: {
      partnerId,
      periodStart,
      periodEnd,
      commissionModel: profile.commissionModel,
      amountCents,
      platformFeeCents,
      taxesCents,
      netAmountCents,
      status: "pending",
    },
    update: {
      amountCents,
      platformFeeCents,
      taxesCents,
      netAmountCents,
      updatedAt: new Date(),
    },
  });

  return commission;
}
