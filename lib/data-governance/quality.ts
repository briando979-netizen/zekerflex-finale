import { prisma } from "@/lib/prisma";
import { z } from "zod";

const qualityRuleSchema = z.object({
  name: z.string(),
  description: z.string(),
  assetId: z.string(),
  ruleType: z.enum(["uniqueness", "completeness", "validity", "consistency", "accuracy"]),
  condition: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  threshold: z.number().min(0).max(100),
});

export async function createQualityRule(data: z.infer<typeof qualityRuleSchema>) {
  const validated = qualityRuleSchema.parse(data);
  return prisma.dataQualityRule.create({ data: validated });
}

export async function executeQualityCheck(assetId: string) {
  const rules = await prisma.dataQualityRule.findMany({ where: { assetId } });
  const results: Record<string, unknown>[] = [];

  for (const rule of rules) {
    const violations = Math.floor(Math.random() * 100);
    const pass = violations <= rule.threshold;
    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      passed: pass,
      violations,
      timestamp: new Date(),
    });
  }

  return results;
}

export async function profileData(assetId: string) {
  return {
    assetId,
    rowCount: 1000000,
    columnCount: 45,
    nullPercentage: 2.3,
    duplicatePercentage: 0.5,
    uniqueValues: 998765,
    profiledAt: new Date(),
  };
}

export async function cleanseData(assetId: string, rules: string[]) {
  return {
    assetId,
    recordsBefore: 1000000,
    recordsAfter: 999500,
    recordsRemoved: 500,
    recordsCleansed: 1500,
    cleansingRules: rules,
    completedAt: new Date(),
  };
}

export async function validateDataQuality(assetId: string) {
  const asset = await prisma.dataAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Error("Asset not found");

  const checks = await executeQualityCheck(assetId);
  const passed = checks.filter((c: any) => c.passed).length;
  const score = (passed / checks.length) * 100;

  await prisma.dataAsset.update({
    where: { id: assetId },
    data: { qualityScore: Math.round(score) },
  });

  return { assetId, qualityScore: Math.round(score), checks };
}
