import { prisma } from "@/lib/prisma";
import { AuditLogger } from "@/lib/audit";
import { z } from "zod";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

export const taxReportSchema = z.object({
  freelancerId: z.string(),
  tenantId: z.string(),
  period: z.string(), // YYYY-MM or YYYY-Q or YYYY format
  periodType: z.enum(["monthly", "quarterly", "annual"]),
  grossIncome: z.number().nonnegative(),
  deductions: z.number().nonnegative(),
  taxableIncome: z.number().nonnegative(),
  taxesPaid: z.number().nonnegative(),
  status: z.enum(["draft", "generated", "reviewed", "filed", "paid"]),
});

/**
 * Genereer maandelijks belastingrapport
 */
export async function generateMonthlyReport(
  freelancerId: string,
  tenantId: string,
  year: number,
  month: number
) {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 1);
  const period = `${year}-${String(month).padStart(2, "0")}`;

  // Verzamel invoices voor deze maand
  const invoices = await prisma.invoice.findMany({
    where: {
      recipientId: freelancerId,
      createdAt: {
        gte: periodStart,
        lt: periodEnd,
      },
    },
  });

  const grossIncome = invoices.reduce(
    (sum, inv) => sum + (inv.totalAmountInCents ?? 0),
    0
  );

  // Schat aftrekposten (12% als standaard schattingt)
  const deductions = Math.round(grossIncome * 0.12);
  const taxableIncome = grossIncome - deductions;

  const report = await prisma.taxReport.create({
    data: {
      freelancerId,
      tenantId,
      period,
      periodType: "monthly",
      periodStart,
      periodEnd,
      grossIncome,
      deductions,
      taxableIncome,
      taxesPaid: 0,
      netto: taxableIncome,
      invoiceCount: invoices.length,
      documentType: "tax_summary",
      status: "generated",
    },
  });

  await AuditLogger.log({
    userId: "system",
    action: "CREATE",
    resource: "TaxReport",
    resourceId: report.id,
    status: "SUCCESS",
    metadata: {
      freelancerId,
      period,
      grossIncome,
    },
  });

  return report;
}

/**
 * Genereer driemaandelijks belastingrapport
 */
export async function generateQuarterlyReport(
  freelancerId: string,
  tenantId: string,
  year: number,
  quarter: number
) {
  const monthStart = (quarter - 1) * 3 + 1;
  const periodStart = new Date(year, monthStart - 1, 1);
  const periodEnd = new Date(year, monthStart + 2, 1);
  const period = `${year}-Q${quarter}`;

  const invoices = await prisma.invoice.findMany({
    where: {
      recipientId: freelancerId,
      createdAt: {
        gte: periodStart,
        lt: periodEnd,
      },
    },
  });

  const grossIncome = invoices.reduce(
    (sum, inv) => sum + (inv.totalAmountInCents ?? 0),
    0
  );
  const deductions = Math.round(grossIncome * 0.12);
  const taxableIncome = grossIncome - deductions;

  const report = await prisma.taxReport.create({
    data: {
      freelancerId,
      tenantId,
      period,
      periodType: "quarterly",
      periodStart,
      periodEnd,
      grossIncome,
      deductions,
      taxableIncome,
      taxesPaid: 0,
      netto: taxableIncome,
      invoiceCount: invoices.length,
      documentType: "quarterly_report",
      status: "generated",
    },
  });

  await AuditLogger.log({
    userId: "system",
    action: "CREATE",
    resource: "TaxReport",
    resourceId: report.id,
    status: "SUCCESS",
    metadata: {
      freelancerId,
      period,
      quarter,
    },
  });

  return report;
}

/**
 * Genereer jaarlijks belastingrapport
 */
export async function generateAnnualReport(
  freelancerId: string,
  tenantId: string,
  year: number
) {
  const periodStart = new Date(year, 0, 1);
  const periodEnd = new Date(year + 1, 0, 1);
  const period = String(year);

  const invoices = await prisma.invoice.findMany({
    where: {
      recipientId: freelancerId,
      createdAt: {
        gte: periodStart,
        lt: periodEnd,
      },
    },
  });

  const grossIncome = invoices.reduce(
    (sum, inv) => sum + (inv.totalAmountInCents ?? 0),
    0
  );
  const deductions = Math.round(grossIncome * 0.12);
  const taxableIncome = grossIncome - deductions;

  // Voor eigen contractoren: geschatte winstbelasting ~19%
  const estimatedTaxes = Math.round(taxableIncome * 0.19);

  const report = await prisma.taxReport.create({
    data: {
      freelancerId,
      tenantId,
      period,
      periodType: "annual",
      periodStart,
      periodEnd,
      grossIncome,
      deductions,
      taxableIncome,
      taxesPaid: estimatedTaxes,
      netto: taxableIncome - estimatedTaxes,
      invoiceCount: invoices.length,
      documentType: "annual_tax_return",
      status: "generated",
    },
  });

  await AuditLogger.log({
    userId: "system",
    action: "CREATE",
    resource: "TaxReport",
    resourceId: report.id,
    status: "SUCCESS",
    metadata: {
      freelancerId,
      year,
      grossIncome,
      estimatedTaxes,
    },
  });

  return report;
}

/**
 * Genereer factuur voor een klus
 */
export async function generateInvoice(
  freelancerId: string,
  tenantId: string,
  data: {
    shiftId: string;
    amount: number;
    description: string;
    invoiceDate: Date;
    dueDate: Date;
  }
) {
  const freelancer = await prisma.freelancerProfile.findUnique({
    where: { userId: freelancerId },
    include: { user: true },
  });

  if (!freelancer) {
    throw new Error("Freelancer niet gevonden");
  }

  const invoiceNumber = await generateInvoiceNumber(tenantId);

  const report = await prisma.taxReport.create({
    data: {
      freelancerId,
      tenantId,
      period: data.invoiceDate.toISOString().slice(0, 7),
      periodType: "monthly",
      periodStart: data.invoiceDate,
      periodEnd: data.dueDate,
      grossIncome: data.amount,
      deductions: 0,
      taxableIncome: data.amount,
      taxesPaid: 0,
      netto: data.amount,
      invoiceCount: 1,
      documentType: "invoice",
      status: "generated",
      content: JSON.stringify({
        invoiceNumber,
        freelancerName: freelancer.user.fullName,
        freelancerId,
        amount: data.amount,
        description: data.description,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
        shiftId: data.shiftId,
      }),
    },
  });

  await AuditLogger.log({
    userId: freelancerId,
    action: "CREATE",
    resource: "TaxReport",
    resourceId: report.id,
    status: "SUCCESS",
    metadata: {
      type: "invoice",
      invoiceNumber,
      amount: data.amount,
    },
  });

  return report;
}

/**
 * Haal aftrekpositenoverzicht op
 */
export async function getDeductionSummary(
  freelancerId: string,
  year: number
) {
  const expenses = await prisma.expenseLog.findMany({
    where: {
      freelancerId,
      createdAt: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    },
  });

  const totalDeductions = expenses.reduce((sum, e) => sum + e.amount, 0);
  const byCategory = expenses.reduce(
    (acc, e) => {
      if (!acc[e.category]) {
        acc[e.category] = 0;
      }
      acc[e.category] += e.amount;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    year,
    totalDeductions,
    expenses,
    byCategory,
  };
}

/**
 * Haal alle belastingrapporten op voor een freelancer
 */
export async function getTaxReports(
  freelancerId: string,
  tenantId: string,
  periodType?: "monthly" | "quarterly" | "annual"
) {
  return await prisma.taxReport.findMany({
    where: {
      freelancerId,
      tenantId,
      ...(periodType ? { periodType } : {}),
    },
    orderBy: { period: "desc" },
  });
}

/**
 * Markeer rapport als herzien
 */
export async function reviewTaxReport(
  reportId: string,
  reviewedBy: string
) {
  const report = await prisma.taxReport.update({
    where: { id: reportId },
    data: {
      status: "reviewed",
      reviewedBy,
      reviewedAt: new Date(),
    },
  });

  await AuditLogger.log({
    userId: reviewedBy,
    action: "UPDATE",
    resource: "TaxReport",
    resourceId: reportId,
    status: "SUCCESS",
    metadata: { status: "reviewed" },
  });

  return report;
}

/**
 * Markeer rapport als ingediend
 */
export async function fileTaxReport(
  reportId: string,
  filedBy: string,
  externalReference?: string
) {
  const report = await prisma.taxReport.update({
    where: { id: reportId },
    data: {
      status: "filed",
      filedAt: new Date(),
      reviewedBy: filedBy,
    },
  });

  await AuditLogger.log({
    userId: filedBy,
    action: "UPDATE",
    resource: "TaxReport",
    resourceId: reportId,
    status: "SUCCESS",
    metadata: {
      status: "filed",
      externalReference,
    },
  });

  return report;
}

/**
 * Genereer factuurnummer
 */
async function generateInvoiceNumber(tenantId: string): Promise<string> {
  const count = await prisma.taxReport.count({
    where: { tenantId, documentType: "invoice" },
  });

  const year = new Date().getFullYear();
  return `${tenantId.substring(0, 4)}-${year}-${String(count + 1).padStart(6, "0")}`;
}

/**
 * Export belastingrapporten als CSV
 */
export async function exportTaxReportsAsCSV(
  freelancerId: string,
  tenantId: string
): Promise<string> {
  const reports = await getTaxReports(freelancerId, tenantId);

  if (reports.length === 0) {
    return "Geen belastingrapporten beschikbaar";
  }

  const headers = [
    "Periode",
    "Brutoinkomsten",
    "Aftrekposten",
    "Belastinggrondslag",
    "Belastingen",
    "Netto",
    "Status",
  ];

  const rows = reports.map((r) => [
    r.period,
    (r.grossIncome / 100).toFixed(2),
    (r.deductions / 100).toFixed(2),
    (r.taxableIncome / 100).toFixed(2),
    (r.taxesPaid / 100).toFixed(2),
    (r.netto / 100).toFixed(2),
    r.status,
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
  ].join("\n");

  return csvContent;
}

/**
 * Haal belastingsamenvatting op voor dashboard
 */
export async function getTaxSummary(
  freelancerId: string,
  tenantId: string
) {
  const currentYear = new Date().getFullYear();

  const annualReport = await prisma.taxReport.findFirst({
    where: {
      freelancerId,
      tenantId,
      periodType: "annual",
      period: String(currentYear),
    },
  });

  const quarterlyReports = await prisma.taxReport.findMany({
    where: {
      freelancerId,
      tenantId,
      periodType: "quarterly",
      period: { startsWith: String(currentYear) },
    },
    orderBy: { period: "desc" },
    take: 4,
  });

  const totalGrossIncome = (annualReport?.grossIncome ?? 0) +
    quarterlyReports.reduce((sum, r) => sum + (r.grossIncome ?? 0), 0);

  return {
    year: currentYear,
    totalGrossIncome,
    annualReport: annualReport ?? null,
    quarterlyReports,
    estimatedTaxes:
      (annualReport?.taxesPaid ?? 0) +
      quarterlyReports.reduce((sum, r) => sum + (r.taxesPaid ?? 0), 0),
  };
}
