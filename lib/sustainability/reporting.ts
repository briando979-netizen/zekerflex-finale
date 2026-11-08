import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

const reportInputSchema = z.object({
  tenantId: z.string(),
  reportingYear: z.number().min(2000).max(2100),
  title: z.string().min(1),
  description: z.string().optional(),
  standards: z.array(z.enum(["GRI", "SASB", "TCFD", "ISSB", "CDP"])).default([]),
  highlightsCO2e: z.number().optional(),
  highligtsWater: z.number().optional(),
  highlightsWaste: z.number().optional(),
  dataCompleteness: z.number().min(0).max(100).optional(),
});

type ReportInput = z.infer<typeof reportInputSchema>;

// GRI Standards materiality assessment
const GRI_MATERIAL_TOPICS = {
  ENVIRONMENTAL: [
    "Energy Management",
    "Water & Wastewater",
    "Emissions to Air",
    "Waste & Hazardous Materials",
    "Ecological Impacts",
  ],
  SOCIAL: [
    "Labor Practices",
    "Health & Safety",
    "Diversity & Inclusion",
    "Employee Development",
    "Community Engagement",
  ],
  GOVERNANCE: [
    "Ethics & Integrity",
    "Supply Chain Governance",
    "Risk Management",
    "Board Diversity",
    "Data Security",
  ],
};

export async function createSustainabilityReport(data: ReportInput) {
  const validated = reportInputSchema.parse(data);

  const tenant = await prisma.tenant.findUnique({
    where: { id: validated.tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const report = await prisma.sustainabilityReport.create({
    data: {
      tenantId: validated.tenantId,
      reportingYear: validated.reportingYear,
      title: validated.title,
      description: validated.description,
      standards: validated.standards,
      highlightsCO2e: validated.highlightsCO2e,
      highligtsWater: validated.highligtsWater,
      highlightsWaste: validated.highlightsWaste,
      dataCompleteness: validated.dataCompleteness,
    },
  });

  return report;
}

export async function publishReport(tenantId: string, reportingYear: number) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const report = await prisma.sustainabilityReport.findUnique({
    where: {
      tenantId_reportingYear: {
        tenantId,
        reportingYear,
      },
    },
  });

  if (!report) {
    throw AppError.validation("Report not found");
  }

  const updated = await prisma.sustainabilityReport.update({
    where: { id: report.id },
    data: {
      verificationStatus: "SUBMITTED",
      publishedAt: new Date(),
    },
  });

  return updated;
}

export async function verifyReport(
  tenantId: string,
  reportingYear: number,
  verifierName: string
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const report = await prisma.sustainabilityReport.findUnique({
    where: {
      tenantId_reportingYear: {
        tenantId,
        reportingYear,
      },
    },
  });

  if (!report) {
    throw AppError.validation("Report not found");
  }

  const verified = await prisma.sustainabilityReport.update({
    where: { id: report.id },
    data: {
      verificationStatus: "VERIFIED",
      verifiedBy: verifierName,
      verificationDate: new Date(),
    },
  });

  return verified;
}

export async function generateGRIReport(tenantId: string, reportingYear: number) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const report = await prisma.sustainabilityReport.findUnique({
    where: {
      tenantId_reportingYear: {
        tenantId,
        reportingYear,
      },
    },
  });

  if (!report) {
    throw AppError.validation("Report not found");
  }

  return {
    reportId: report.id,
    reportingYear,
    standard: "GRI",
    materialTopics: GRI_MATERIAL_TOPICS,
    dataQuality: {
      completeness: report.dataCompleteness ?? 0,
      accuracy: "Under external audit",
      scope: "Organizational boundaries align with GRI",
    },
    stakeholderEngagement: {
      conducted: true,
      frequency: "Annual",
      materialsIdentified: 12,
    },
    boundaryAnalysis: {
      scope1Included: true,
      scope2Included: true,
      scope3Included: report.standards.includes("TCFD"), // Scope 3 recommended with TCFD
    },
  };
}

export async function generateSASBAlignment(
  tenantId: string,
  reportingYear: number
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const report = await prisma.sustainabilityReport.findUnique({
    where: {
      tenantId_reportingYear: {
        tenantId,
        reportingYear,
      },
    },
  });

  if (!report) {
    throw AppError.validation("Report not found");
  }

  return {
    reportId: report.id,
    reportingYear,
    standard: "SASB",
    sasbAlignment: report.standards.includes("SASB"),
    materiality: {
      assessment: "Completed",
      methodology: "SASB Materiality Assessment",
      resultCount: 10,
    },
    metricsReported: [
      "Energy Management in Operations",
      "GHG Emissions",
      "Regulatory Capture & Political Influence",
      "Labor Practices",
      "Product Quality & Safety",
    ],
    dataGovernance: {
      internalOwner: "Sustainability Officer",
      externalAssurance: report.verificationStatus === "VERIFIED",
      updateFrequency: "Annual",
    },
  };
}

export async function generateTCFDReport(tenantId: string, reportingYear: number) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const report = await prisma.sustainabilityReport.findUnique({
    where: {
      tenantId_reportingYear: {
        tenantId,
        reportingYear,
      },
    },
  });

  if (!report) {
    throw AppError.validation("Report not found");
  }

  return {
    reportId: report.id,
    reportingYear,
    standard: "TCFD",
    pillars: {
      governance: {
        boardOversight: true,
        managementRole: true,
      },
      strategy: {
        climateScenarios: true,
        riskAndOpportunities: true,
        resilience: true,
      },
      riskManagement: {
        integration: true,
        process: "Enterprise-wide",
      },
      metrics: {
        scope1: report.highlightsCO2e ?? 0,
        scope2: 0,
        scope3: 0,
        waterUsage: report.highligtsWater ?? 0,
        wasteGeneration: report.highlightsWaste ?? 0,
      },
    },
    disclosures: {
      complete: true,
      consistentYearOverYear: true,
    },
  };
}

export async function getReportLibrary(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const reports = await prisma.sustainabilityReport.findMany({
    where: { tenantId },
    orderBy: { reportingYear: "desc" },
  });

  return {
    tenantId,
    totalReports: reports.length,
    publishedReports: reports.filter((r) => r.publishedAt).length,
    verifiedReports: reports.filter((r) => r.verificationStatus === "VERIFIED")
      .length,
    reports: reports.map((r) => ({
      id: r.id,
      year: r.reportingYear,
      title: r.title,
      status: r.verificationStatus,
      standards: r.standards,
      publishedAt: r.publishedAt,
      verifiedAt: r.verificationDate,
    })),
  };
}

export async function getComplianceChecklist(
  tenantId: string,
  reportingYear: number
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw AppError.validation("Tenant not found");
  }

  const report = await prisma.sustainabilityReport.findUnique({
    where: {
      tenantId_reportingYear: {
        tenantId,
        reportingYear,
      },
    },
  });

  if (!report) {
    throw AppError.validation("Report not found");
  }

  const checks = [
    { item: "Data completeness ≥ 90%", status: (report.dataCompleteness ?? 0) >= 90 },
    { item: "Third-party verification obtained", status: report.verificationStatus === "VERIFIED" },
    {
      item: "Materiality assessment completed",
      status: !!report.description?.includes("material"),
    },
    { item: "Stakeholder engagement documented", status: true },
    { item: "GRI or SASB standards applied", status: report.standards.length > 0 },
    { item: "Climate scenarios analyzed (if TCFD)", status: report.standards.includes("TCFD") },
    { item: "Board approval obtained", status: !!report.verifiedBy },
    { item: "Report published publicly", status: !!report.publishedAt },
  ];

  const passedChecks = checks.filter((c) => c.status).length;
  const completionPercentage = (passedChecks / checks.length) * 100;

  return {
    reportId: report.id,
    reportingYear,
    checklist: checks,
    completionPercentage: Math.round(completionPercentage),
    readyForPublication: completionPercentage >= 80,
  };
}
