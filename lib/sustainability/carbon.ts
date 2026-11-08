import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

const carbonInputSchema = z.object({
  tenantId: z.string(),
  reportingPeriod: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  scope: z.enum(["SCOPE_1", "SCOPE_2", "SCOPE_3"]),
  category: z.enum([
    "VEHICLE_FUEL",
    "ELECTRICITY",
    "NATURAL_GAS",
    "HEATING_OIL",
    "WASTE",
    "BUSINESS_TRAVEL",
    "EMPLOYEE_COMMUTE",
    "SUPPLY_CHAIN",
    "WATER",
    "OTHER",
  ]),
  emissionsCO2e: z.number().positive("Emissions must be positive"),
  source: z.string().min(1),
  verified: z.boolean().optional().default(false),
  reductionTarget: z.number().optional(),
  offsetsCO2e: z.number().optional(),
});

type CarbonInput = z.infer<typeof carbonInputSchema>;

// Conversion factors (approximate, in kg CO2e)
const EMISSION_FACTORS = {
  VEHICLE_FUEL: 2.31, // per liter of petrol
  ELECTRICITY: 0.42, // per kWh (grid average, varies by country)
  NATURAL_GAS: 2.04, // per m3
  HEATING_OIL: 3.15, // per liter
  BUSINESS_TRAVEL: 0.0001, // per km by plane (approximate)
};

export async function recordCarbonEmission(data: CarbonInput) {
  const validated = carbonInputSchema.parse(data);

  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: validated.tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const emission = await prisma.carbonFootprint.create({
    data: {
      tenantId: validated.tenantId,
      reportingPeriod: validated.reportingPeriod,
      scope: validated.scope,
      category: validated.category,
      emissionsCO2e: validated.emissionsCO2e,
      source: validated.source,
      verified: validated.verified,
      reductionTarget: validated.reductionTarget,
      offsetsCO2e: validated.offsetsCO2e,
    },
  });

  return emission;
}

export async function getCarbonFootprint(
  tenantId: string,
  reportingPeriod: string
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const emissions = await prisma.carbonFootprint.findMany({
    where: {
      tenantId,
      reportingPeriod,
    },
  });

  const scopeTotals = {
    SCOPE_1: 0,
    SCOPE_2: 0,
    SCOPE_3: 0,
  };

  const categoryBreakdown: Record<string, number> = {};
  let totalEmissions = 0;
  let totalOffsets = 0;

  for (const emission of emissions) {
    scopeTotals[emission.scope as keyof typeof scopeTotals] +=
      emission.emissionsCO2e;
    categoryBreakdown[emission.category] = (categoryBreakdown[emission.category] ?? 0) +
      emission.emissionsCO2e;
    totalEmissions += emission.emissionsCO2e;
    if (emission.offsetsCO2e) {
      totalOffsets += emission.offsetsCO2e;
    }
  }

  const netEmissions = totalEmissions - totalOffsets;

  return {
    tenantId,
    reportingPeriod,
    emissions,
    scopeTotals,
    categoryBreakdown,
    totalEmissions,
    totalOffsets,
    netEmissions,
  };
}

export async function calculateReductionProgress(
  tenantId: string,
  category: string
) {
  const emissions = await prisma.carbonFootprint.findMany({
    where: {
      tenantId,
      category,
    },
    orderBy: {
      reportingPeriod: "asc",
    },
  });

  if (emissions.length < 2) {
    return {
      category,
      dataPoints: emissions.length,
      message: "Insufficient data for trend analysis",
    };
  }

  const earliest = emissions[0]!;
  const latest = emissions[emissions.length - 1]!;

  const percentChange =
    ((latest.emissionsCO2e - earliest.emissionsCO2e) / earliest.emissionsCO2e) *
    100;
  const isReducing = percentChange < 0;
  const trend = emissions.map((e) => ({
    period: e.reportingPeriod,
    emissions: e.emissionsCO2e,
    offsetsCO2e: e.offsetsCO2e ?? 0,
  }));

  return {
    category,
    from: earliest.reportingPeriod,
    to: latest.reportingPeriod,
    initialEmissions: earliest.emissionsCO2e,
    latestEmissions: latest.emissionsCO2e,
    percentChange: isReducing
      ? -Math.abs(percentChange)
      : Math.abs(percentChange),
    isReducing,
    trend,
    aggregateOffsets: emissions.reduce((sum, e) => sum + (e.offsetsCO2e ?? 0), 0),
  };
}

export async function setReductionGoals(
  tenantId: string,
  reportingPeriod: string,
  goals: Array<{
    category: string;
    targetReduction: number; // percentage
  }>
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const updated = await Promise.all(
    goals.map((goal) =>
      prisma.carbonFootprint.updateMany({
        where: {
          tenantId,
          reportingPeriod,
          category: goal.category,
        },
        data: {
          reductionTarget: goal.targetReduction,
        },
      })
    )
  );

  return {
    tenantId,
    reportingPeriod,
    goalsSet: goals.length,
    updatedRecords: updated.reduce((sum, result) => sum + result.count, 0),
  };
}

export async function getScienceBasedTargets(tenantId: string) {
  // Science-based targets framework (SBTi)
  // Returns recommended reduction targets based on sector
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const currentYear = new Date().getFullYear();
  const targetYear = currentYear + 10;

  return {
    tenantId,
    currentYear,
    targetYear,
    recommendedTargets: {
      scope1And2: {
        reductionPercentage: 50,
        description: "50% reduction in Scope 1 and 2 emissions by 2035",
      },
      scope3: {
        reductionPercentage: 30,
        description: "30% reduction in Scope 3 emissions by 2035",
      },
      combined: {
        reductionPercentage: 42,
        description: "Overall 42% net reduction across all scopes",
      },
    },
    methodology: "Science-Based Targets initiative (SBTi)",
  };
}

export async function verifyEmissionData(
  tenantId: string,
  reportingPeriod: string,
  verifyingParty: string
) {
  const emissions = await prisma.carbonFootprint.findMany({
    where: {
      tenantId,
      reportingPeriod,
    },
  });

  if (emissions.length === 0) {
    throw AppError.validation("No emissions found for this period");
  }

  const verificationDate = new Date();
  const updated = await prisma.carbonFootprint.updateMany({
    where: {
      tenantId,
      reportingPeriod,
    },
    data: {
      verified: true,
      verificationDate,
    },
  });

  return {
    tenantId,
    reportingPeriod,
    verifiedBy: verifyingParty,
    verificationDate,
    recordsVerified: updated.count,
  };
}
