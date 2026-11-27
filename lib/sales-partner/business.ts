import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export interface PartnerBusinessData {
  businessName: string;
  kvkNumber?: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  sector?: string;
  estimatedEmployees?: number;
  website?: string;
  notes?: string;
}

/**
 * Submit a new business lead as a sales partner
 */
export async function submitPartnerBusiness(
  partnerId: string,
  data: PartnerBusinessData
) {
  // Validate partner exists
  const profile = await prisma.salesPartnerProfile.findUnique({
    where: { userId: partnerId },
  });

  if (!profile) {
    throw new AppError.notFound("Partner profiel niet gevonden");
  }

  // Create business lead
  const business = await prisma.salesPartnerBusiness.create({
    data: {
      partnerId,
      businessName: data.businessName,
      kvkNumber: data.kvkNumber,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      sector: data.sector,
      estimatedEmployees: data.estimatedEmployees,
      website: data.website,
      notes: data.notes,
    },
  });

  // Update partner's submission count
  await prisma.salesPartnerProfile.update({
    where: { userId: partnerId },
    data: {
      businessesSubmitted: { increment: 1 },
    },
  });

  return business;
}

/**
 * Approve a business lead by admin
 */
export async function approvePartnerBusiness(
  businessId: string,
  approverId: string,
  commissionCents?: number
) {
  const business = await prisma.salesPartnerBusiness.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new AppError.notFound("Bedrijf niet gevonden");
  }

  const updatedBusiness = await prisma.salesPartnerBusiness.update({
    where: { id: businessId },
    data: {
      status: "APPROVED",
      approvedById: approverId,
      approvedAt: new Date(),
      commissionCents: commissionCents || null,
    },
  });

  // Increment partner's approved count
  await prisma.salesPartnerProfile.update({
    where: { userId: business.partnerId },
    data: {
      businessesApproved: { increment: 1 },
      totalCommissionCents: {
        increment: commissionCents || 0,
      },
    },
  });

  return updatedBusiness;
}

/**
 * Reject a business lead
 */
export async function rejectPartnerBusiness(
  businessId: string,
  approverId: string,
  reason: string
) {
  const business = await prisma.salesPartnerBusiness.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new AppError.notFound("Bedrijf niet gevonden");
  }

  const updatedBusiness = await prisma.salesPartnerBusiness.update({
    where: { id: businessId },
    data: {
      status: "REJECTED",
      approvedById: approverId,
      approvedAt: new Date(),
      rejectionReason: reason,
    },
  });

  return updatedBusiness;
}

/**
 * Mark business as contacted
 */
export async function markBusinessAsContacted(businessId: string) {
  const business = await prisma.salesPartnerBusiness.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new AppError.notFound("Bedrijf niet gevonden");
  }

  return prisma.salesPartnerBusiness.update({
    where: { id: businessId },
    data: {
      status: "CONTACTED",
    },
  });
}

/**
 * Mark business as converted (actual customer)
 */
export async function markBusinessAsConverted(businessId: string) {
  const business = await prisma.salesPartnerBusiness.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new AppError.notFound("Bedrijf niet gevonden");
  }

  return prisma.salesPartnerBusiness.update({
    where: { id: businessId },
    data: {
      status: "CONVERTED",
    },
  });
}

/**
 * Get statistics for a partner
 */
export async function getPartnerStatistics(partnerId: string) {
  const profile = await prisma.salesPartnerProfile.findUnique({
    where: { userId: partnerId },
  });

  if (!profile) {
    throw new AppError.notFound("Partner profiel niet gevonden");
  }

  const businesses = await prisma.salesPartnerBusiness.findMany({
    where: { partnerId },
  });

  const statusCounts = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    CONTACTED: 0,
    CONVERTED: 0,
  };

  businesses.forEach((b) => {
    statusCounts[b.status as keyof typeof statusCounts]++;
  });

  const conversionRate =
    statusCounts.APPROVED > 0
      ? (statusCounts.CONVERTED / statusCounts.APPROVED) * 100
      : 0;

  return {
    profile,
    statusCounts,
    totalBusinesses: businesses.length,
    conversionRate,
    approvalRate:
      statusCounts.PENDING + statusCounts.APPROVED + statusCounts.REJECTED > 0
        ? (statusCounts.APPROVED /
            (statusCounts.PENDING + statusCounts.APPROVED + statusCounts.REJECTED)) *
          100
        : 0,
  };
}
