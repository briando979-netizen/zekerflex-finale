import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

const esgGovernanceInputSchema = z.object({
  tenantId: z.string(),
  policyName: z.string().min(1),
  description: z.string().min(1),
  policyType: z.string(),
  effectiveDate: z.date(),
  expiryDate: z.date().optional(),
  boardApproved: z.boolean().default(false),
  approvedBy: z.string().optional(),
  internalLink: z.string().optional(),
  certificationBody: z.string().optional(),
  certificationExpiry: z.date().optional(),
});

type ESGGovernanceInput = z.infer<typeof esgGovernanceInputSchema>;

const stakeholderEngagementInputSchema = z.object({
  tenantId: z.string(),
  engagementDate: z.date(),
  stakeholderType: z.enum([
    "EMPLOYEE",
    "CUSTOMER",
    "INVESTOR",
    "NGO",
    "COMMUNITY",
    "SUPPLIER",
    "GOVERNMENT",
  ]),
  topic: z.string(),
  participantCount: z.number().int().positive(),
  feedbackSummary: z.string(),
  actionItems: z.array(z.string()).default([]),
  followUpDate: z.date().optional(),
});

type StakeholderEngagementInput = z.infer<typeof stakeholderEngagementInputSchema>;

// ISO standards and certifications
const CERTIFICATIONS = {
  ISO_14001: {
    name: "ISO 14001 - Environmental Management",
    renewalFrequency: 3, // years
  },
  ISO_45001: {
    name: "ISO 45001 - Occupational Health & Safety",
    renewalFrequency: 3,
  },
  ISO_50001: {
    name: "ISO 50001 - Energy Management",
    renewalFrequency: 3,
  },
  SA_8000: {
    name: "SA 8000 - Social Accountability",
    renewalFrequency: 3,
  },
  B_CORP: {
    name: "B Corporation",
    renewalFrequency: 3,
  },
  CARBON_TRUST: {
    name: "Carbon Trust Standard",
    renewalFrequency: 2,
  },
};

// ESG policies framework
const ESG_POLICY_FRAMEWORK = [
  {
    category: "ENVIRONMENTAL",
    policies: [
      "Carbon Reduction Policy",
      "Waste Management Policy",
      "Water Conservation Policy",
      "Renewable Energy Policy",
      "Biodiversity Protection Policy",
    ],
  },
  {
    category: "SOCIAL",
    policies: [
      "Labor Rights Policy",
      "Diversity & Inclusion Policy",
      "Health & Safety Policy",
      "Community Engagement Policy",
      "Supply Chain Labor Policy",
    ],
  },
  {
    category: "GOVERNANCE",
    policies: [
      "Code of Conduct",
      "Anti-Corruption Policy",
      "Risk Management Policy",
      "Board Diversity Policy",
      "Data Privacy & Security Policy",
    ],
  },
];

export async function createESGPolicy(data: ESGGovernanceInput) {
  const validated = esgGovernanceInputSchema.parse(data);

  const tenant = await prisma.tenant.findUnique({
    where: { id: validated.tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const policy = await prisma.esgGovernance.create({
    data: {
      tenantId: validated.tenantId,
      policyName: validated.policyName,
      description: validated.description,
      policyType: validated.policyType,
      effectiveDate: validated.effectiveDate,
      expiryDate: validated.expiryDate,
      boardApproved: validated.boardApproved,
      approvedBy: validated.approvedBy,
      internalLink: validated.internalLink,
      certificationBody: validated.certificationBody,
      certificationExpiry: validated.certificationExpiry,
    },
  });

  return policy;
}

export async function approveESGPolicy(tenantId: string, policyId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const policy = await prisma.esgGovernance.update({
    where: { id: policyId },
    data: {
      boardApproved: true,
      boardApprovalDate: new Date(),
    },
  });

  return policy;
}

export async function recordStakeholderEngagement(
  data: StakeholderEngagementInput
) {
  const validated = stakeholderEngagementInputSchema.parse(data);

  const tenant = await prisma.tenant.findUnique({
    where: { id: validated.tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const engagement = await prisma.stakeholderEngagement.create({
    data: {
      tenantId: validated.tenantId,
      engagementDate: validated.engagementDate,
      stakeholderType: validated.stakeholderType,
      topic: validated.topic,
      participantCount: validated.participantCount,
      feedbackSummary: validated.feedbackSummary,
      actionItems: validated.actionItems,
      followUpDate: validated.followUpDate,
    },
  });

  return engagement;
}

export async function getGovernanceStatus(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const policies = await prisma.esgGovernance.findMany({
    where: { tenantId },
  });

  const boardApprovedPolicies = policies.filter((p) => p.boardApproved).length;
  const certifiedPolicies = policies.filter((p) => p.certificationBody).length;
  const expiredCertifications = policies.filter(
    (p) => p.certificationExpiry && p.certificationExpiry <= new Date()
  ).length;

  const policyTypeDistribution: Record<string, number> = {};
  for (const policy of policies) {
    policyTypeDistribution[policy.policyType] = (policyTypeDistribution[policy.policyType] ?? 0) +
      1;
  }

  return {
    tenantId,
    totalPolicies: policies.length,
    boardApprovedPolicies,
    certifiedPolicies,
    expiredCertifications,
    policyTypeDistribution,
    complianceScore: Math.round((boardApprovedPolicies / Math.max(policies.length, 1)) * 100),
    policies,
  };
}

export async function getComplianceCertifications(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const policies = await prisma.esgGovernance.findMany({
    where: {
      tenantId,
      certificationBody: { not: null },
    },
    orderBy: {
      certificationExpiry: "asc",
    },
  });

  const now = new Date();
  const expiredCerts = policies.filter(
    (p) => p.certificationExpiry && p.certificationExpiry <= now
  );
  const expiringCerts = policies.filter(
    (p) =>
      p.certificationExpiry &&
      p.certificationExpiry > now &&
      p.certificationExpiry <= new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  );
  const activeCerts = policies.filter(
    (p) =>
      p.certificationExpiry &&
      p.certificationExpiry > new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  );

  return {
    tenantId,
    totalCertifications: policies.length,
    activeCertifications: activeCerts.length,
    expiringCertifications: expiringCerts.length,
    expiredCertifications: expiredCerts.length,
    active: activeCerts,
    expiring: expiringCerts,
    expired: expiredCerts,
  };
}

export async function getStakeholderEngagementHistory(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const engagements = await prisma.stakeholderEngagement.findMany({
    where: { tenantId },
    orderBy: {
      engagementDate: "desc",
    },
  });

  const engagementByType: Record<string, number> = {};
  let totalParticipants = 0;
  const topics = new Set<string>();

  for (const engagement of engagements) {
    engagementByType[engagement.stakeholderType] = (engagementByType[engagement.stakeholderType] ?? 0) +
      1;
    totalParticipants += engagement.participantCount;
    topics.add(engagement.topic);
  }

  return {
    tenantId,
    totalEngagements: engagements.length,
    totalParticipants,
    uniqueTopics: topics.size,
    engagementByType,
    topics: Array.from(topics),
    engagements,
  };
}

export async function generateComplianceReport(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const governanceStatus = await getGovernanceStatus(tenantId);
  const certifications = await getComplianceCertifications(tenantId);
  const engagementHistory = await getStakeholderEngagementHistory(tenantId);

  const overallComplianceScore = Math.round(
    (governanceStatus.complianceScore +
      (certifications.activeCertifications /
        Math.max(certifications.totalCertifications, 1)) *
        100) /
      2
  );

  return {
    tenantId,
    reportDate: new Date(),
    overallComplianceScore,
    complianceLevel:
      overallComplianceScore >= 90
        ? "EXCELLENT"
        : overallComplianceScore >= 75
          ? "GOOD"
          : overallComplianceScore >= 60
            ? "SATISFACTORY"
            : "NEEDS_IMPROVEMENT",
    governance: governanceStatus,
    certifications,
    stakeholderEngagement: engagementHistory,
    riskAreas: identifyComplianceRisks(
      governanceStatus,
      certifications,
      engagementHistory
    ),
  };
}

function identifyComplianceRisks(
  governance: Awaited<ReturnType<typeof getGovernanceStatus>>,
  certifications: Awaited<ReturnType<typeof getComplianceCertifications>>,
  engagement: Awaited<ReturnType<typeof getStakeholderEngagementHistory>>
): Array<{ risk: string; severity: "HIGH" | "MEDIUM" | "LOW" }> {
  const risks: Array<{ risk: string; severity: "HIGH" | "MEDIUM" | "LOW" }> = [];

  if (governance.boardApprovedPolicies < governance.totalPolicies * 0.8) {
    risks.push({
      risk: "Insufficient board approval of ESG policies",
      severity: "HIGH",
    });
  }

  if (certifications.expiredCertifications > 0) {
    risks.push({
      risk: `${certifications.expiredCertifications} expired certifications need renewal`,
      severity: "HIGH",
    });
  }

  if (certifications.expiringCertifications > 2) {
    risks.push({
      risk: "Multiple certifications expiring soon",
      severity: "MEDIUM",
    });
  }

  if (engagement.totalEngagements < 4) {
    risks.push({
      risk: "Limited stakeholder engagement activity",
      severity: "MEDIUM",
    });
  }

  if (governance.totalPolicies === 0) {
    risks.push({
      risk: "No ESG policies documented",
      severity: "HIGH",
    });
  }

  return risks;
}

export async function getPolicyFramework() {
  return ESG_POLICY_FRAMEWORK;
}

export async function getRecommendedCertifications() {
  return Object.entries(CERTIFICATIONS).map(([code, config]) => ({
    code,
    name: config.name,
    renewalFrequency: config.renewalFrequency,
  }));
}

export async function conductComplianceAudit(
  tenantId: string,
  auditScope: Array<"POLICIES" | "CERTIFICATIONS" | "ENGAGEMENT">
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const auditResults: Record<string, any> = {
    tenantId,
    auditDate: new Date(),
    scope: auditScope,
  };

  if (auditScope.includes("POLICIES")) {
    const policies = await prisma.esgGovernance.findMany({
      where: { tenantId },
    });
    auditResults.policies = {
      totalCount: policies.length,
      boardApproved: policies.filter((p) => p.boardApproved).length,
      withAssignedOwner: policies.filter((p) => p.approvedBy).length,
      issues: policies.length === 0 ? ["No policies found"] : [],
    };
  }

  if (auditScope.includes("CERTIFICATIONS")) {
    const policies = await prisma.esgGovernance.findMany({
      where: {
        tenantId,
        certificationBody: { not: null },
      },
    });
    const now = new Date();
    auditResults.certifications = {
      totalCount: policies.length,
      active: policies.filter(
        (p) => p.certificationExpiry && p.certificationExpiry > now
      ).length,
      expired: policies.filter(
        (p) => p.certificationExpiry && p.certificationExpiry <= now
      ).length,
      issues:
        policies.length === 0
          ? ["No certifications obtained"]
          : policies.filter(
              (p) => p.certificationExpiry && p.certificationExpiry <= now
            ).length > 0
            ? ["Expired certifications require renewal"]
            : [],
    };
  }

  if (auditScope.includes("ENGAGEMENT")) {
    const engagements = await prisma.stakeholderEngagement.findMany({
      where: { tenantId },
    });
    const recentEngagements = engagements.filter(
      (e) =>
        e.engagementDate >= new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    );
    auditResults.engagement = {
      totalEngagements: engagements.length,
      recentEngagements: recentEngagements.length,
      uniqueStakeholderTypes: new Set(engagements.map((e) => e.stakeholderType))
        .size,
      issues:
        recentEngagements.length < 2
          ? ["Insufficient recent stakeholder engagement"]
          : [],
    };
  }

  return auditResults;
}

export async function scheduleComplianceReview(
  tenantId: string,
  reviewDate: Date,
  reviewScope: string
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  // Update all governance records with a lastComplianceCheck timestamp
  await prisma.esgGovernance.updateMany({
    where: { tenantId },
    data: {
      lastComplianceCheck: reviewDate,
      complianceChecks: { increment: 1 },
    },
  });

  return {
    tenantId,
    reviewScheduled: true,
    reviewDate,
    scope: reviewScope,
    message: "Compliance review scheduled successfully",
  };
}
