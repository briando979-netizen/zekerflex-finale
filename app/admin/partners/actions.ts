"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { UserRole } from "@prisma/client";

// Fetch all partners with optional filtering
export async function fetchAllPartners(status?: string, page: number = 1, limit: number = 20) {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new AppError.unauthorized();
  }

  // Check PLATFORM_ADMIN role
  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      role: UserRole.PLATFORM_ADMIN,
    },
  });

  if (!membership) {
    throw new AppError.forbidden("Alleen platform-admins kunnen dit zien");
  }

  const skip = (page - 1) * limit;

  const where: any = {};
  if (status) where.status = status;

  const [partners, total] = await Promise.all([
    prisma.salesPartnerProfile.findMany({
      where,
      skip,
      take: limit,
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.salesPartnerProfile.count({ where }),
  ]);

  return {
    partners,
    total,
    pages: Math.ceil(total / limit),
  };
}

// Fetch pending business leads for approval
export async function fetchPendingBusinessLeads(page: number = 1, limit: number = 20) {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new AppError.unauthorized();
  }

  // Check PLATFORM_ADMIN role
  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      role: UserRole.PLATFORM_ADMIN,
    },
  });

  if (!membership) {
    throw new AppError.forbidden("Alleen platform-admins kunnen dit zien");
  }

  const skip = (page - 1) * limit;

  const [leads, total] = await Promise.all([
    prisma.salesPartnerBusiness.findMany({
      where: { status: "PENDING" },
      skip,
      take: limit,
      include: {
        partner: {
          select: { id: true, email: true, fullName: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.salesPartnerBusiness.count({
      where: { status: "PENDING" },
    }),
  ]);

  return {
    leads,
    total,
    pages: Math.ceil(total / limit),
  };
}

// Approve a business lead
export async function approveBusiness(businessId: string, approverId: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new AppError.unauthorized();
  }

  // Check PLATFORM_ADMIN role
  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      role: UserRole.PLATFORM_ADMIN,
    },
  });

  if (!membership) {
    throw new AppError.forbidden("Alleen platform-admins kunnen dit goedkeuren");
  }

  // Find the business
  const business = await prisma.salesPartnerBusiness.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new AppError.notFound("Bedrijf niet gevonden");
  }

  // Update business and increment partner's approved count
  const updatedBusiness = await prisma.salesPartnerBusiness.update({
    where: { id: businessId },
    data: {
      status: "APPROVED",
      approvedById: approverId,
      approvedAt: new Date(),
    },
  });

  await prisma.salesPartnerProfile.update({
    where: { userId: business.partnerId },
    data: {
      businessesApproved: { increment: 1 },
    },
  });

  return updatedBusiness;
}

// Reject a business lead
export async function rejectBusiness(
  businessId: string,
  approverId: string,
  reason: string
) {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new AppError.unauthorized();
  }

  // Check PLATFORM_ADMIN role
  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      role: UserRole.PLATFORM_ADMIN,
    },
  });

  if (!membership) {
    throw new AppError.forbidden("Alleen platform-admins kunnen dit afwijzen");
  }

  // Find the business
  const business = await prisma.salesPartnerBusiness.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new AppError.notFound("Bedrijf niet gevonden");
  }

  // Update business
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

// Generate monthly commission CSV export
export async function generateMonthlyCommissionCSV(year: number, month: number) {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new AppError.unauthorized();
  }

  // Check PLATFORM_ADMIN role
  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      role: UserRole.PLATFORM_ADMIN,
    },
  });

  if (!membership) {
    throw new AppError.forbidden("Alleen platform-admins kunnen dit exporteren");
  }

  // Fetch commissions for the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const commissions = await prisma.salesPartnerCommission.findMany({
    where: {
      periodStart: {
        gte: startDate,
      },
      periodEnd: {
        lte: endDate,
      },
    },
    include: {
      partner: {
        select: { email: true, fullName: true },
      },
    },
    orderBy: { partner: { email: "asc" } },
  });

  // Create CSV header
  const headers = [
    "Partner Email",
    "Partner Naam",
    "Periode Start",
    "Periode Einde",
    "Model",
    "Bruto (€)",
    "Platform Fee (€)",
    "Belastingen (€)",
    "Netto (€)",
    "Status",
  ];

  // Create CSV rows
  const rows = commissions.map((c) => [
    c.partner.email,
    c.partner.fullName,
    c.periodStart.toISOString().split("T")[0],
    c.periodEnd.toISOString().split("T")[0],
    c.commissionModel === "model_a" ? "Percentage" : "Vaste Fee",
    (c.amountCents / 100).toFixed(2),
    (c.platformFeeCents / 100).toFixed(2),
    (c.taxesCents / 100).toFixed(2),
    (c.netAmountCents / 100).toFixed(2),
    c.status,
  ]);

  // Combine and return as string
  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

  return csv;
}
