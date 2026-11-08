import { prisma } from "@/lib/prisma";

const NL_TAX_RATES = {
  VAT_LOW: 0.09,
  VAT_STANDARD: 0.21,
  VAT_HIGH: 0.21,
  CORPORATE_TAX: 0.19,
};

export async function calculateVAT(amountCents: number, rate: "LOW" | "STANDARD" = "STANDARD"): Promise<number> {
  const rateMap = {
    LOW: NL_TAX_RATES.VAT_LOW,
    STANDARD: NL_TAX_RATES.VAT_STANDARD,
  };
  return Math.round(amountCents * rateMap[rate]);
}

export async function calculateCorporateTax(profitCents: number): Promise<number> {
  // 19% corporate tax in Netherlands
  return Math.round(profitCents * NL_TAX_RATES.CORPORATE_TAX);
}

export async function calculateQuarterlyEstimate(annualProfitCents: number): Promise<{ quarterly: number; monthly: number }> {
  const tax = Math.round(annualProfitCents * NL_TAX_RATES.CORPORATE_TAX);
  return {
    quarterly: Math.round(tax / 4),
    monthly: Math.round(tax / 12),
  };
}

export async function calculateDeductibleExpenses(tenantId: string, year: number) {
  const expenses = await prisma.expense.findMany({
    where: {
      tenantId,
      status: "APPROVED",
      date: {
        gte: new Date(year, 0, 1),
        lt: new Date(year + 1, 0, 1),
      },
      taxCategory: { not: null },
    },
  });

  const deductible = new Map<string, number>();

  for (const expense of expenses) {
    const category = expense.taxCategory ?? "OTHER";
    deductible.set(category, (deductible.get(category) ?? 0) + expense.amountCents);
  }

  return Object.fromEntries(deductible);
}

export async function calculateTaxableIncome(year: number, grossIncomeCents: number, deductionsCents: number): Promise<number> {
  return Math.max(0, grossIncomeCents - deductionsCents);
}

export async function generateTaxReport(tenantId: string, year: number) {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year + 1, 0, 0);

  const invoices = await prisma.invoice.findMany({
    where: {
      issuerId: tenantId,
      issuedAt: { gte: startDate, lte: endDate },
      status: { in: ["SENT", "PAID"] },
    },
  });

  const grossIncome = invoices.reduce((sum, inv) => sum + (inv.paidCents ?? 0), 0);
  const deductions = await calculateDeductibleExpenses(tenantId, year);
  const totalDeductions = Object.values(deductions).reduce((a, b) => a + (b as number), 0) as number;
  const taxableIncome = Math.max(0, grossIncome - totalDeductions);
  const taxDue = await calculateCorporateTax(taxableIncome);

  return {
    year,
    grossIncomeCents: grossIncome,
    deductionsCents: totalDeductions,
    taxableIncomeCents: taxableIncome,
    taxDueCents: taxDue,
    deductionsByCategory: deductions,
    invoiceCount: invoices.length,
  };
}

export async function exportForAccountant(tenantId: string, year: number) {
  const taxReport = await generateTaxReport(tenantId, year);
  const entries = await prisma.journalEntry.findMany({
    where: {
      tenantId,
      date: {
        gte: new Date(year, 0, 1),
        lt: new Date(year + 1, 0, 1),
      },
    },
    include: { ledgerLines: true },
  });

  return {
    taxReport,
    journalEntries: entries,
    exportDate: new Date(),
  };
}

export async function checkVATFiling(tenantId: string, quarter: number, year: number) {
  const startMonth = (quarter - 1) * 3;
  const endMonth = startMonth + 2;

  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, endMonth + 1, 0);

  const sales = await prisma.invoice.findMany({
    where: {
      issuerId: tenantId,
      issuedAt: { gte: startDate, lte: endDate },
    },
  });

  const totalSales = sales.reduce((sum, inv) => sum + inv.amountCents, 0);
  const vat = await calculateVAT(totalSales, "STANDARD");

  return {
    quarter,
    year,
    period: { start: startDate, end: endDate },
    totalSalesCents: totalSales,
    vatDueCents: vat,
    filingDueDate: new Date(year, endMonth + 1, 21),
  };
}

export async function trackTaxPayments(tenantId: string) {
  const payments = await prisma.taxPayment.findMany({
    where: { tenantId },
    orderBy: { dueDate: "asc" },
  });

  return payments;
}

export async function recordTaxPayment(tenantId: string, amountCents: number, paymentDate: Date, periodType: "QUARTERLY" | "MONTHLY", period: number, year: number) {
  return prisma.taxPayment.create({
    data: {
      tenantId,
      amountCents,
      paymentDate,
      periodType,
      period,
      year,
      dueDate: new Date(year, periodType === "QUARTERLY" ? period * 3 : period, 21),
    },
  });
}
