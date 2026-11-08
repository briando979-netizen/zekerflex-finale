import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

const greenProcurementInputSchema = z.object({
  tenantId: z.string(),
  productName: z.string().min(1),
  vendorId: z.string(),
  vendorName: z.string().min(1),
  criteria: z.array(
    z.enum([
      "CARBON_NEUTRAL",
      "RECYCLABLE",
      "FAIR_TRADE",
      "LOCAL_SOURCING",
      "ORGANIC",
      "ENERGY_EFFICIENT",
      "WATER_EFFICIENT",
      "ETHICAL_LABOR",
      "ZERO_WASTE",
    ])
  ),
  certifications: z.array(z.string()).default([]),
  costPremium: z.number().optional(),
  environmentalImpact: z.string(),
  quantity: z.number().int().positive(),
  purchaseDate: z.date(),
  approvedBy: z.string(),
  notes: z.string().optional(),
});

type GreenProcurementInput = z.infer<typeof greenProcurementInputSchema>;

// Green procurement certification standards
const ENVIRONMENTAL_CERTIFICATIONS = {
  ISO_14001: "Environmental Management System",
  ISO_50001: "Energy Management System",
  FAIR_TRADE: "Fair Trade Certification",
  ORGANIC: "Organic Product Certification",
  CARBON_TRUST: "Carbon Trust Standard",
  B_CORP: "B Corporation Certified",
  CRADLE_TO_CRADLE: "Cradle to Cradle Certification",
  RAINFOREST_ALLIANCE: "Rainforest Alliance Certified",
  FSC: "Forest Stewardship Council",
  MSC: "Marine Stewardship Council",
  EU_ECOLABEL: "EU Ecolabel",
  NORDIC_SWAN: "Nordic Swan Ecolabel",
};

export async function recordGreenProcurement(data: GreenProcurementInput) {
  const validated = greenProcurementInputSchema.parse(data);

  const tenant = await prisma.tenant.findUnique({
    where: { id: validated.tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const procurement = await prisma.greenProcurement.create({
    data: {
      tenantId: validated.tenantId,
      productName: validated.productName,
      vendorId: validated.vendorId,
      vendorName: validated.vendorName,
      criteria: validated.criteria,
      certifications: validated.certifications,
      costPremium: validated.costPremium,
      environmentalImpact: validated.environmentalImpact,
      quantity: validated.quantity,
      purchaseDate: validated.purchaseDate,
      approvedBy: validated.approvedBy,
      notes: validated.notes,
    },
  });

  return procurement;
}

export async function getGreenProcurementMetrics(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const procurements = await prisma.greenProcurement.findMany({
    where: { tenantId },
  });

  if (procurements.length === 0) {
    return {
      tenantId,
      totalProcurements: 0,
      message: "No green procurement records found",
    };
  }

  const totalQuantity = procurements.reduce((sum, p) => sum + p.quantity, 0);
  const totalPremium = procurements.reduce((sum, p) => sum + (p.costPremium ?? 0) * p.quantity, 0);
  const avgPremium = totalPremium / totalQuantity;

  const criteriaUsage: Record<string, number> = {};
  for (const procurement of procurements) {
    for (const criterion of procurement.criteria) {
      criteriaUsage[criterion] = (criteriaUsage[criterion] ?? 0) + 1;
    }
  }

  const certificationUsage: Record<string, number> = {};
  for (const procurement of procurements) {
    for (const cert of procurement.certifications) {
      certificationUsage[cert] = (certificationUsage[cert] ?? 0) + 1;
    }
  }

  return {
    tenantId,
    totalProcurements: procurements.length,
    totalQuantity,
    totalCostPremium: totalPremium,
    averagePremiumPercentage: Math.round(avgPremium),
    criteriaUsage: Object.entries(criteriaUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
    topCertifications: Object.entries(certificationUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
  };
}

export async function getVendorESGRating(tenantId: string, vendorId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const procurements = await prisma.greenProcurement.findMany({
    where: {
      tenantId,
      vendorId,
    },
    orderBy: {
      purchaseDate: "desc",
    },
  });

  if (procurements.length === 0) {
    throw AppError.validation("No procurements found for this vendor");
  }

  const allCertifications = new Set<string>();
  let totalEnvironmentalImpact = "";

  for (const p of procurements) {
    for (const cert of p.certifications) {
      allCertifications.add(cert);
    }
    totalEnvironmentalImpact = p.environmentalImpact;
  }

  const rating =
    allCertifications.size >= 5
      ? "A"
      : allCertifications.size >= 3
        ? "B"
        : allCertifications.size >= 1
          ? "C"
          : "D";

  return {
    vendorId,
    vendorName: procurements[0]!.vendorName,
    esgRating: rating,
    certificationsCount: allCertifications.size,
    certifications: Array.from(allCertifications),
    procurementCount: procurements.length,
    lastProcurement: procurements[0]!.purchaseDate,
    recommendedCertifications: Array.from(allCertifications).length < 5
      ? Object.keys(ENVIRONMENTAL_CERTIFICATIONS).slice(0, 3)
      : [],
  };
}

export async function getGreenProcurementByPeriod(
  tenantId: string,
  startDate: Date,
  endDate: Date
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const procurements = await prisma.greenProcurement.findMany({
    where: {
      tenantId,
      purchaseDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: {
      purchaseDate: "desc",
    },
  });

  const criteriaBreakdown: Record<string, number> = {};
  let totalPremium = 0;

  for (const p of procurements) {
    for (const criterion of p.criteria) {
      criteriaBreakdown[criterion] = (criteriaBreakdown[criterion] ?? 0) + p.quantity;
    }
    totalPremium += (p.costPremium ?? 0) * p.quantity;
  }

  return {
    tenantId,
    period: { from: startDate, to: endDate },
    procurementCount: procurements.length,
    procurements,
    criteriaBreakdown,
    totalCostPremium: totalPremium,
    averagePremium:
      procurements.length > 0
        ? totalPremium / procurements.length
        : 0,
  };
}

export async function calculateSustainableProcurementScore(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const procurements = await prisma.greenProcurement.findMany({
    where: { tenantId },
  });

  if (procurements.length === 0) {
    return {
      tenantId,
      score: 0,
      message: "No procurement data available",
    };
  }

  let score = 0;

  // 1. Procurement volume (0-20 points)
  const volumeScore = Math.min(procurements.length * 2, 20);
  score += volumeScore;

  // 2. Certification coverage (0-30 points)
  const certificationCoverage =
    procurements.filter((p) => p.certifications.length > 0).length /
    procurements.length;
  score += certificationCoverage * 30;

  // 3. Criteria diversity (0-20 points)
  const uniqueCriteria = new Set<string>();
  for (const p of procurements) {
    for (const criterion of p.criteria) {
      uniqueCriteria.add(criterion);
    }
  }
  const criteriaScore = (uniqueCriteria.size / 9) * 20; // 9 total criteria
  score += criteriaScore;

  // 4. Green vendor adoption (0-20 points)
  const uniqueVendors = new Set(procurements.map((p) => p.vendorId));
  const greenVendorScore = Math.min(uniqueVendors.size * 2, 20);
  score += greenVendorScore;

  // 5. Cost consideration bonus (0-10 points)
  const avgPremium = procurements.reduce(
    (sum, p) => sum + (p.costPremium ?? 0),
    0
  ) / procurements.length;
  const costBonus = avgPremium > 0 ? 10 : 0; // Bonus for willing to pay more for sustainability
  score += costBonus;

  return {
    tenantId,
    score: Math.round(score),
    maxScore: 100,
    rating:
      score >= 80
        ? "A"
        : score >= 60
          ? "B"
          : score >= 40
            ? "C"
            : "D",
    breakdown: {
      procurementVolume: volumeScore,
      certificationCoverage: certificationCoverage * 30,
      criteriaDiversity: criteriaScore,
      greenVendorAdoption: greenVendorScore,
      costConsideration: costBonus,
    },
    recommendedActions:
      score < 60
        ? [
            "Increase green procurement initiatives",
            "Certify more vendors",
            "Diversify sustainability criteria",
          ]
        : [],
  };
}

export async function getAvailableCertifications() {
  return Object.entries(ENVIRONMENTAL_CERTIFICATIONS).map(([code, name]) => ({
    code,
    name,
  }));
}

export async function generateProcurementImpactReport(
  tenantId: string,
  startDate: Date,
  endDate: Date
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const procurements = await prisma.greenProcurement.findMany({
    where: {
      tenantId,
      purchaseDate: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  if (procurements.length === 0) {
    return {
      tenantId,
      period: { from: startDate, to: endDate },
      message: "No procurements in this period",
    };
  }

  return {
    tenantId,
    period: { from: startDate, to: endDate },
    procurementCount: procurements.length,
    totalQuantity: procurements.reduce((sum, p) => sum + p.quantity, 0),
    totalCostPremium: procurements.reduce(
      (sum, p) => sum + (p.costPremium ?? 0) * p.quantity,
      0
    ),
    topCriteria: Array.from(
      new Set(procurements.flatMap((p) => p.criteria))
    ).slice(0, 3),
    topCertifications: Array.from(
      new Set(procurements.flatMap((p) => p.certifications))
    ).slice(0, 5),
    topVendors: procurements
      .reduce(
        (acc, p) => {
          const existing = acc.find((v) => v.vendorId === p.vendorId);
          if (existing) {
            existing.count++;
          } else {
            acc.push({
              vendorId: p.vendorId,
              vendorName: p.vendorName,
              count: 1,
            });
          }
          return acc;
        },
        [] as Array<{ vendorId: string; vendorName: string; count: number }>
      )
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    impactSummary:
      procurements.map((p) => p.environmentalImpact).join("; "),
  };
}
