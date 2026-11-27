"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { z } from "zod";

// Get partner KPIs for the dashboard
export async function fetchPartnerKpis(userId: string) {
  const session = await getSession();
  if (!session?.user?.id || session.user.id !== userId) {
    throw new AppError.unauthorized();
  }

  const profile = await prisma.salesPartnerProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    throw new AppError.notFound("Partner profiel niet gevonden");
  }

  const businesses = await prisma.salesPartnerBusiness.findMany({
    where: { partnerId: userId },
  });

  const approvedBusinesses = businesses.filter((b) => b.status === "APPROVED");
  const commissions = await prisma.salesPartnerCommission.findMany({
    where: { partnerId: userId, status: "paid" },
  });

  const totalEarnings = commissions.reduce((sum, c) => sum + c.netAmountCents, 0);

  return {
    status: profile.status,
    businessesSubmitted: profile.businessesSubmitted,
    businessesApproved: profile.businessesApproved,
    totalEarnings,
    thisMonthEarnings:
      commissions
        .filter((c) => {
          const now = new Date();
          return (
            c.periodStart.getMonth() === now.getMonth() &&
            c.periodStart.getFullYear() === now.getFullYear()
          );
        })
        .reduce((sum, c) => sum + c.netAmountCents, 0) || 0,
    isVerified: profile.isVerified,
  };
}

// Fetch paginated list of partner businesses
export async function fetchPartnerBusinesses(
  userId: string,
  page: number = 1,
  limit: number = 20
) {
  const session = await getSession();
  if (!session?.user?.id || session.user.id !== userId) {
    throw new AppError.unauthorized();
  }

  const skip = (page - 1) * limit;

  const [businesses, total] = await Promise.all([
    prisma.salesPartnerBusiness.findMany({
      where: { partnerId: userId },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        approvedBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
    }),
    prisma.salesPartnerBusiness.count({
      where: { partnerId: userId },
    }),
  ]);

  return {
    businesses,
    total,
    pages: Math.ceil(total / limit),
  };
}

// Submit a new business lead
const submitBusinessSchema = z.object({
  businessName: z.string().min(2, "Bedrijfsnaam is verplicht"),
  kvkNumber: z.string().optional(),
  contactName: z.string().min(2, "Contactnaam is verplicht"),
  contactEmail: z.string().email("Geldig e-mailadres vereist"),
  contactPhone: z.string().min(10, "Geldig telefoonnummer vereist"),
  sector: z.string().optional(),
  estimatedEmployees: z.number().int().positive().optional(),
  website: z.string().url("Geldig website-URL vereist").optional(),
  notes: z.string().optional(),
});

export async function submitBusiness(userId: string, data: unknown) {
  const session = await getSession();
  if (!session?.user?.id || session.user.id !== userId) {
    throw new AppError.unauthorized();
  }

  // Validate input
  const validated = submitBusinessSchema.parse(data);

  // Check partner profile exists
  const profile = await prisma.salesPartnerProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    throw new AppError.notFound("Partner profiel niet gevonden");
  }

  // Create business lead
  const business = await prisma.salesPartnerBusiness.create({
    data: {
      partnerId: userId,
      businessName: validated.businessName,
      kvkNumber: validated.kvkNumber,
      contactName: validated.contactName,
      contactEmail: validated.contactEmail,
      contactPhone: validated.contactPhone,
      sector: validated.sector,
      estimatedEmployees: validated.estimatedEmployees,
      website: validated.website,
      notes: validated.notes,
    },
  });

  // Update partner's submission count
  await prisma.salesPartnerProfile.update({
    where: { userId },
    data: {
      businessesSubmitted: { increment: 1 },
    },
  });

  return business;
}

// Export commission data as CSV
export async function exportCommissionCSV(userId: string) {
  const session = await getSession();
  if (!session?.user?.id || session.user.id !== userId) {
    throw new AppError.unauthorized();
  }

  const commissions = await prisma.salesPartnerCommission.findMany({
    where: { partnerId: userId },
    orderBy: { periodStart: "desc" },
  });

  // Create CSV header
  const headers = [
    "Periode Start",
    "Periode Einde",
    "Model",
    "Bruto (€)",
    "Platform Fee (€)",
    "Belastingen (€)",
    "Netto (€)",
    "Status",
    "Betaald Op",
  ];

  // Create CSV rows
  const rows = commissions.map((c) => [
    c.periodStart.toISOString().split("T")[0],
    c.periodEnd.toISOString().split("T")[0],
    c.commissionModel === "model_a" ? "Percentage" : "Vaste Fee",
    (c.amountCents / 100).toFixed(2),
    (c.platformFeeCents / 100).toFixed(2),
    (c.taxesCents / 100).toFixed(2),
    (c.netAmountCents / 100).toFixed(2),
    c.status,
    c.paidAt ? c.paidAt.toISOString().split("T")[0] : "",
  ]);

  // Combine and return as string
  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

  return csv;
}
