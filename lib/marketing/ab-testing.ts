import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

// Schema voor A/B test configuratie
const abTestSchema = z.object({
  campaignId: z.string(),
  type: z.enum(["subject_line", "content", "send_time", "sender_name"]),
  variantA: z.object({
    name: z.string(),
    value: z.string(),
  }),
  variantB: z.object({
    name: z.string(),
    value: z.string(),
  }),
  splitPercentage: z.number().min(1).max(100).default(50),
  testDuration: z.number().optional(), // Uren
  successMetric: z
    .enum(["open_rate", "click_rate", "conversion_rate"])
    .default("open_rate"),
});

export type ABTestInput = z.infer<typeof abTestSchema>;

// Maak een A/B test aan
export async function createABTest(
  tenantId: string,
  data: ABTestInput
) {
  const parsed = abTestSchema.parse(data);

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: parsed.campaignId },
  });

  if (!campaign || campaign.tenantId !== tenantId) {
    throw AppError.notFound("Campagne niet gevonden");
  }

  const test = await prisma.emailABTest.create({
    data: {
      campaignId: parsed.campaignId,
      type: parsed.type,
      variantA: parsed.variantA,
      variantB: parsed.variantB,
      splitPercentage: parsed.splitPercentage,
      testDuration: parsed.testDuration,
      successMetric: parsed.successMetric,
      status: "CREATED",
    },
  });

  return test;
}

// Haal A/B tests op
export async function getABTests(tenantId: string, campaignId?: string) {
  return prisma.emailABTest.findMany({
    where: {
      campaign: {
        tenantId,
        ...(campaignId && { id: campaignId }),
      },
    },
    include: { campaign: true },
    orderBy: { createdAt: "desc" },
  });
}

// Haal één A/B test op
export async function getABTest(tenantId: string, testId: string) {
  const test = await prisma.emailABTest.findUnique({
    where: { id: testId },
    include: { campaign: true },
  });

  if (!test || test.campaign?.tenantId !== tenantId) {
    throw AppError.notFound("Test niet gevonden");
  }

  return test;
}

// Werk A/B test bij
export async function updateABTest(
  tenantId: string,
  testId: string,
  data: Partial<ABTestInput>
) {
  const test = await getABTest(tenantId, testId);
  const partial = abTestSchema.partial().parse(data);

  return prisma.emailABTest.update({
    where: { id: testId },
    data: partial,
  });
}

// Start A/B test
export async function startABTest(tenantId: string, testId: string) {
  const test = await getABTest(tenantId, testId);

  if (test.status !== "CREATED") {
    throw AppError.validation(
      "Alleen nieuwe tests kunnen worden gestart"
    );
  }

  return prisma.emailABTest.update({
    where: { id: testId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
    },
  });
}

// Bepaal winnaar A/B test
export async function determineWinner(tenantId: string, testId: string) {
  const test = await getABTest(tenantId, testId);

  if (test.status !== "RUNNING") {
    throw AppError.validation("Alleen actieve tests kunnen eindigen");
  }

  // Bereken prestaties
  const variantAMetrics = await getVariantMetrics(
    test.campaignId,
    "A",
    test.successMetric
  );
  const variantBMetrics = await getVariantMetrics(
    test.campaignId,
    "B",
    test.successMetric
  );

  const winner =
    (variantAMetrics.rate ?? 0) > (variantBMetrics.rate ?? 0) ? "A" : "B";

  return prisma.emailABTest.update({
    where: { id: testId },
    data: {
      status: "COMPLETED",
      endedAt: new Date(),
      winner: winner as "A" | "B",
      variantAMetrics: variantAMetrics,
      variantBMetrics: variantBMetrics,
    },
  });
}

// Haal metriek van een variant op
export async function getVariantMetrics(
  campaignId: string,
  variant: "A" | "B",
  metric: string
) {
  const sends = await prisma.emailSend.findMany({
    where: {
      campaignId,
      // In production zou dit filtereen op de variant groep
    },
  });

  if (sends.length === 0) {
    return {
      count: 0,
      rate: 0,
    };
  }

  let successCount = 0;

  switch (metric) {
    case "open_rate":
      successCount = sends.filter((s) => s.opened).length;
      break;
    case "click_rate":
      successCount = sends.filter((s) => s.clicked).length;
      break;
    case "conversion_rate":
      successCount = sends.filter((s) => s.converted).length;
      break;
  }

  return {
    count: sends.length,
    rate: (successCount / sends.length) * 100,
    successCount,
  };
}

// Verwijder A/B test
export async function deleteABTest(tenantId: string, testId: string) {
  const test = await getABTest(tenantId, testId);

  await prisma.emailABTest.delete({ where: { id: testId } });
  return { deleted: true };
}

// Haal alle actieve A/B tests op
export async function getActiveABTests(tenantId: string) {
  return prisma.emailABTest.findMany({
    where: {
      status: "RUNNING",
      campaign: { tenantId },
    },
    include: { campaign: true },
    orderBy: { startedAt: "desc" },
  });
}

// Haal resultaten van een A/B test op
export async function getABTestResults(tenantId: string, testId: string) {
  const test = await getABTest(tenantId, testId);

  if (test.status === "CREATED") {
    throw AppError.validation("Test is nog niet gestart");
  }

  const variantAMetrics = await getVariantMetrics(
    test.campaignId,
    "A",
    test.successMetric
  );
  const variantBMetrics = await getVariantMetrics(
    test.campaignId,
    "B",
    test.successMetric
  );

  // Bereken statistische significantie (vereenvoudigd Chi-squared)
  const significance = calculateStatisticalSignificance(
    variantAMetrics,
    variantBMetrics
  );

  return {
    testId,
    type: test.type,
    status: test.status,
    winner: test.winner,
    variantA: {
      ...test.variantA,
      ...variantAMetrics,
    },
    variantB: {
      ...test.variantB,
      ...variantBMetrics,
    },
    statistically_significant: significance.isSignificant,
    confidence_level: significance.confidenceLevel,
    recommendation:
      significance.isSignificant && test.winner
        ? `Variant ${test.winner} winning met ${significance.confidenceLevel}% betrouwbaarheid`
        : "Nog niet genoeg gegevens voor significantie",
  };
}

// Bereken statistische significantie (vereenvoudigd)
function calculateStatisticalSignificance(
  variantA: any,
  variantB: any
): { isSignificant: boolean; confidenceLevel: number } {
  const totalA = variantA.count ?? 0;
  const successA = variantA.successCount ?? 0;
  const totalB = variantB.count ?? 0;
  const successB = variantB.successCount ?? 0;

  if (totalA < 30 || totalB < 30) {
    return {
      isSignificant: false,
      confidenceLevel: 0,
    };
  }

  // Vereenvoudigde Z-test
  const rateA = successA / totalA;
  const rateB = successB / totalB;
  const pooledRate = (successA + successB) / (totalA + totalB);
  const se = Math.sqrt(
    pooledRate * (1 - pooledRate) * (1 / totalA + 1 / totalB)
  );
  const z = Math.abs((rateA - rateB) / se);

  // Z > 1.96 = 95% betrouwbaarheid
  const isSignificant = z > 1.96;
  const confidenceLevel = isSignificant ? 95 : 68; // 1 std dev = 68%

  return { isSignificant, confidenceLevel };
}

// Pas winnaar toe op toekomstige campagnes
export async function applyWinnerToTemplate(
  tenantId: string,
  testId: string,
  templateId: string
) {
  const test = await getABTest(tenantId, testId);

  if (!test.winner) {
    throw AppError.validation(
      "Kan winnaar niet toepassen tot test is voltooid"
    );
  }

  const template = await prisma.emailTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template || template.tenantId !== tenantId) {
    throw AppError.notFound("Template niet gevonden");
  }

  const winnerData =
    test.winner === "A"
      ? { variantA: test.variantA.value }
      : { variantB: test.variantB.value };

  switch (test.type) {
    case "subject_line":
      return prisma.emailTemplate.update({
        where: { id: templateId },
        data: { subject: winnerData[test.winner === "A" ? "variantA" : "variantB"] },
      });
    case "content":
      return prisma.emailTemplate.update({
        where: { id: templateId },
        data: { htmlBody: winnerData[test.winner === "A" ? "variantA" : "variantB"] },
      });
    default:
      throw AppError.validation("Test type niet ondersteund voor toepassen");
  }
}

// Haal aanbevelingen op voor volgende tests
export async function getTestRecommendations(tenantId: string) {
  const campaigns = await prisma.emailCampaign.findMany({
    where: { tenantId },
    include: { sends: true },
  });

  const recommendations = [];

  for (const campaign of campaigns) {
    if (campaign.sends.length > 100) {
      // Genoeg data voor test
      recommendations.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        suggestedTests: [
          "subject_line",
          "send_time",
          "content",
        ],
      });
    }
  }

  return recommendations;
}
