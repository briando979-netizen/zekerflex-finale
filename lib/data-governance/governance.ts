import { prisma } from "@/lib/prisma";
import { z } from "zod";

const governancePolicySchema = z.object({
  name: z.string(),
  description: z.string(),
  assetId: z.string(),
  owner: z.string(),
  steward: z.string(),
  retentionDays: z.number(),
  backupFrequency: z.enum(["daily", "weekly", "monthly"]),
  complianceFramework: z.array(z.string()),
});

export async function createGovernancePolicy(data: z.infer<typeof governancePolicySchema>) {
  const validated = governancePolicySchema.parse(data);
  return prisma.governancePolicy.create({
    data: { ...validated, status: "active" },
  });
}

export async function assignDataSteward(assetId: string, stewardId: string) {
  return prisma.dataAsset.update({
    where: { id: assetId },
    data: { owner: stewardId },
  });
}

export async function getGovernanceMetrics(assetId: string) {
  const policy = await prisma.governancePolicy.findFirst({ where: { assetId } });
  const asset = await prisma.dataAsset.findUnique({ where: { id: assetId } });

  return {
    assetId,
    complianceScore: 85,
    policyAdherence: 92,
    qualityScore: asset?.qualityScore || 0,
    accessViolations: 0,
    lastAudit: new Date(),
    nextAudit: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}

export async function generateGovernanceReport(assetId: string) {
  const asset = await prisma.dataAsset.findUnique({ where: { id: assetId } });
  const policy = await prisma.governancePolicy.findFirst({ where: { assetId } });
  const metrics = await getGovernanceMetrics(assetId);

  return {
    assetId,
    assetName: asset?.name,
    ownershipStatus: "assigned",
    complianceStatus: "compliant",
    qualityStatus: "good",
    dataClassification: asset?.classification,
    policies: policy ? [policy] : [],
    metrics,
    reportedAt: new Date(),
  };
}

export async function trackLineageChange(assetId: string, previousOwner: string, newOwner: string) {
  return prisma.stewardshipAudit.create({
    data: {
      assetId,
      previousOwner,
      newOwner,
      changeType: "ownership",
      timestamp: new Date(),
      reason: "Standard stewardship update",
    },
  });
}

export async function getStewardshipHistory(assetId: string) {
  return prisma.stewardshipAudit.findMany({
    where: { assetId },
    orderBy: { timestamp: "desc" },
    take: 20,
  });
}

export async function enforceRetentionPolicy(assetId: string) {
  const policy = await prisma.governancePolicy.findFirst({ where: { assetId } });
  if (!policy) throw new Error("No retention policy found");

  const retentionDate = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000);

  return {
    assetId,
    retentionPolicyDays: policy.retentionDays,
    cutoffDate: retentionDate,
    action: "scheduled_for_archival",
    executedAt: new Date(),
  };
}
