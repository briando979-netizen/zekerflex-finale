import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

// ============================================================================
// 4. BUDGET MANAGEMENT - Allocation, spend tracking, ROI analysis
// ============================================================================

const CreateBudgetLineSchema = z.object({
  campaignId: z.string(),
  lineItem: z.string(),
  allocatedBudget: z.number().positive("Begroting moet positief zijn"),
  forecastedBudget: z.number().optional(),
  expectedReturn: z.number().optional(),
  costCenter: z.string().optional(),
  departmentId: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const UpdateBudgetLineSchema = CreateBudgetLineSchema.partial();

export type CreateBudgetLineInput = z.infer<typeof CreateBudgetLineSchema>;
export type UpdateBudgetLineInput = z.infer<typeof UpdateBudgetLineSchema>;

/**
 * Create a budget line item for a campaign
 */
export async function createBudgetLine(input: CreateBudgetLineInput) {
  const validated = CreateBudgetLineSchema.parse(input);

  if (new Date(validated.startDate) >= new Date(validated.endDate)) {
    throw AppError.validation("Startdatum moet voor einddatum liggen");
  }

  // Verify campaign exists
  const campaign = await prisma.mrmCampaign.findUnique({
    where: { id: validated.campaignId },
  });

  if (!campaign) {
    throw AppError.notFound("Campagne niet gevonden");
  }

  return prisma.mrmBudgetLine.create({
    data: {
      campaignId: validated.campaignId,
      lineItem: validated.lineItem,
      allocatedBudget: Math.round(validated.allocatedBudget * 100), // Store as cents
      forecastedBudget: validated.forecastedBudget
        ? Math.round(validated.forecastedBudget * 100)
        : null,
      expectedReturn: validated.expectedReturn
        ? Math.round(validated.expectedReturn * 100)
        : null,
      costCenter: validated.costCenter,
      departmentId: validated.departmentId,
      startDate: new Date(validated.startDate),
      endDate: new Date(validated.endDate),
    },
  });
}

/**
 * Get budget lines for a campaign
 */
export async function getBudgetLinesByCampaign(campaignId: string) {
  const lines = await prisma.mrmBudgetLine.findMany({
    where: { campaignId },
    orderBy: { createdAt: "asc" },
  });

  return lines.map((line) => ({
    ...line,
    allocatedBudget: line.allocatedBudget / 100,
    spentBudget: line.spentBudget / 100,
    forecastedBudget: line.forecastedBudget ? line.forecastedBudget / 100 : null,
    expectedReturn: line.expectedReturn ? line.expectedReturn / 100 : null,
    actualReturn: line.actualReturn / 100,
  }));
}

/**
 * Get a single budget line by ID
 */
export async function getBudgetLineById(id: string) {
  const line = await prisma.mrmBudgetLine.findUnique({
    where: { id },
  });

  if (!line) {
    throw AppError.notFound("Begrootlijn niet gevonden");
  }

  return {
    ...line,
    allocatedBudget: line.allocatedBudget / 100,
    spentBudget: line.spentBudget / 100,
    forecastedBudget: line.forecastedBudget ? line.forecastedBudget / 100 : null,
    expectedReturn: line.expectedReturn ? line.expectedReturn / 100 : null,
    actualReturn: line.actualReturn / 100,
  };
}

/**
 * Update a budget line
 */
export async function updateBudgetLine(
  id: string,
  input: UpdateBudgetLineInput,
) {
  const validated = UpdateBudgetLineSchema.parse(input);

  const existing = await prisma.mrmBudgetLine.findUnique({
    where: { id },
  });

  if (!existing) {
    throw AppError.notFound("Begrootlijn niet gevonden");
  }

  if (validated.startDate && validated.endDate) {
    if (new Date(validated.startDate) >= new Date(validated.endDate)) {
      throw AppError.validation("Startdatum moet voor einddatum liggen");
    }
  }

  return prisma.mrmBudgetLine.update({
    where: { id },
    data: {
      ...(validated.allocatedBudget !== undefined && {
        allocatedBudget: Math.round(validated.allocatedBudget * 100),
      }),
      ...(validated.forecastedBudget !== undefined && {
        forecastedBudget: validated.forecastedBudget
          ? Math.round(validated.forecastedBudget * 100)
          : null,
      }),
      ...(validated.expectedReturn !== undefined && {
        expectedReturn: validated.expectedReturn
          ? Math.round(validated.expectedReturn * 100)
          : null,
      }),
      ...(validated.costCenter !== undefined && { costCenter: validated.costCenter }),
      ...(validated.departmentId !== undefined && { departmentId: validated.departmentId }),
      ...(validated.startDate !== undefined && {
        startDate: new Date(validated.startDate),
      }),
      ...(validated.endDate !== undefined && {
        endDate: new Date(validated.endDate),
      }),
    },
  });
}

/**
 * Track spend against a budget line
 */
export async function trackSpend(
  id: string,
  amount: number, // Amount to add, in dollars
) {
  const line = await prisma.mrmBudgetLine.findUnique({
    where: { id },
  });

  if (!line) {
    throw AppError.notFound("Begrootlijn niet gevonden");
  }

  const amountCents = Math.round(amount * 100);
  const newSpent = line.spentBudget + amountCents;

  if (newSpent > line.allocatedBudget) {
    throw AppError.validation(
      `Begroting zou overschreden worden. Gealloceerd: €${line.allocatedBudget / 100}, al besteed: €${line.spentBudget / 100}, nu toe te voegen: €${amount}`,
    );
  }

  // Calculate ROI
  const roi =
    line.expectedReturn && newSpent > 0
      ? ((line.expectedReturn - newSpent) / newSpent) * 100
      : null;

  return prisma.mrmBudgetLine.update({
    where: { id },
    data: {
      spentBudget: newSpent,
      roiPercentage: roi,
    },
  });
}

/**
 * Track return/revenue for a budget line
 */
export async function trackReturn(
  id: string,
  amount: number, // Return amount in dollars
) {
  const line = await prisma.mrmBudgetLine.findUnique({
    where: { id },
  });

  if (!line) {
    throw AppError.notFound("Begrootlijn niet gevonden");
  }

  const amountCents = Math.round(amount * 100);
  const newReturn = line.actualReturn + amountCents;

  // Calculate ROI
  const roi = line.spentBudget > 0 ? ((newReturn - line.spentBudget) / line.spentBudget) * 100 : 0;

  return prisma.mrmBudgetLine.update({
    where: { id },
    data: {
      actualReturn: newReturn,
      roiPercentage: roi,
    },
  });
}

/**
 * Get budget summary for a campaign
 */
export async function getCampaignBudgetSummary(campaignId: string) {
  const lines = await prisma.mrmBudgetLine.findMany({
    where: { campaignId },
  });

  const summary = {
    totalAllocated: 0,
    totalSpent: 0,
    totalRemaining: 0,
    totalExpectedReturn: 0,
    totalActualReturn: 0,
    overallRoi: 0,
    lines: [] as any[],
  };

  lines.forEach((line) => {
    summary.totalAllocated += line.allocatedBudget;
    summary.totalSpent += line.spentBudget;
    summary.totalRemaining += line.allocatedBudget - line.spentBudget;
    summary.totalExpectedReturn += line.expectedReturn || 0;
    summary.totalActualReturn += line.actualReturn;

    summary.lines.push({
      id: line.id,
      lineItem: line.lineItem,
      allocatedBudget: line.allocatedBudget / 100,
      spentBudget: line.spentBudget / 100,
      remaining: (line.allocatedBudget - line.spentBudget) / 100,
      roi: line.roiPercentage,
    });
  });

  if (summary.totalSpent > 0) {
    summary.overallRoi = ((summary.totalActualReturn - summary.totalSpent) / summary.totalSpent) * 100;
  }

  return {
    ...summary,
    totalAllocated: summary.totalAllocated / 100,
    totalSpent: summary.totalSpent / 100,
    totalRemaining: summary.totalRemaining / 100,
    totalExpectedReturn: summary.totalExpectedReturn / 100,
    totalActualReturn: summary.totalActualReturn / 100,
  };
}

/**
 * Get budget alerts (over-budget lines)
 */
export async function getBudgetAlerts(campaignId: string) {
  const lines = await prisma.mrmBudgetLine.findMany({
    where: { campaignId },
  });

  const alerts = lines
    .filter((line) => line.spentBudget >= line.allocatedBudget * 0.8) // Alert at 80%
    .map((line) => ({
      id: line.id,
      lineItem: line.lineItem,
      allocatedBudget: line.allocatedBudget / 100,
      spentBudget: line.spentBudget / 100,
      percentageUsed: (line.spentBudget / line.allocatedBudget) * 100,
      severity:
        line.spentBudget >= line.allocatedBudget
          ? "CRITICAL"
          : line.spentBudget >= line.allocatedBudget * 0.9
            ? "WARNING"
            : "CAUTION",
    }));

  return alerts;
}

/**
 * Forecast budget needs for a line item
 */
export async function forecastBudgetNeed(
  id: string,
  currentRate: number, // Spend per day
  daysRemaining: number,
) {
  const line = await prisma.mrmBudgetLine.findUnique({
    where: { id },
  });

  if (!line) {
    throw AppError.notFound("Begrootlijn niet gevonden");
  }

  const projectedTotalSpend = line.spentBudget + Math.round(currentRate * 100 * daysRemaining);
  const potentialOverage = Math.max(0, projectedTotalSpend - line.allocatedBudget);

  return {
    currentSpent: line.spentBudget / 100,
    allocatedBudget: line.allocatedBudget / 100,
    projectedTotalSpend: projectedTotalSpend / 100,
    potentialOverage: potentialOverage / 100,
    willExceedBudget: projectedTotalSpend > line.allocatedBudget,
  };
}
