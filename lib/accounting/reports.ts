import { prisma } from "@/lib/prisma";
import { generateIncomeStatement, generateBalanceSheet, generateTrialBalance } from "./ledger";

export async function generateProfitLossStatement(tenantId: string, startDate: Date, endDate: Date) {
  const statement = await generateIncomeStatement(tenantId, startDate, endDate);

  return {
    title: "Profit & Loss Statement",
    period: { start: startDate, end: endDate },
    revenue: { label: "Total Revenue", cents: statement.revenue },
    costOfGoods: { label: "Cost of Goods Sold", cents: statement.costOfGoodsSold },
    grossProfit: { label: "Gross Profit", cents: statement.grossProfit },
    operatingExpenses: { label: "Operating Expenses", cents: statement.operatingExpenses },
    netIncome: { label: "Net Income", cents: statement.netIncome },
    netMargin: statement.revenue > 0 ? (statement.netIncome / statement.revenue) * 100 : 0,
  };
}

export async function generateCashFlowReport(tenantId: string, startDate: Date, endDate: Date) {
  const invoices = await prisma.invoice.findMany({
    where: {
      issuerId: tenantId,
      issuedAt: { gte: startDate, lte: endDate },
    },
  });

  const expenses = await prisma.expense.findMany({
    where: {
      tenantId,
      date: { gte: startDate, lte: endDate },
      status: "APPROVED",
    },
  });

  const inflows = invoices.reduce((sum, inv) => sum + (inv.paidCents ?? 0), 0);
  const outflows = expenses.reduce((sum, exp) => sum + exp.amountCents, 0);
  const netCashFlow = inflows - outflows;

  return {
    title: "Cash Flow Report",
    period: { start: startDate, end: endDate },
    operatingActivitiesInflow: { label: "Cash In (Invoices Paid)", cents: inflows },
    operatingActivitiesOutflow: { label: "Cash Out (Expenses)", cents: outflows },
    netCashFlow: { label: "Net Cash Flow", cents: netCashFlow },
  };
}

export async function generateARAgingReport(tenantId: string) {
  const invoices = await prisma.invoice.findMany({
    where: {
      issuerId: tenantId,
      status: { in: ["UNPAID", "PARTIALLY_PAID"] },
    },
  });

  const now = new Date();
  const aged = {
    current: { days: "0-30", cents: 0, count: 0 },
    thirtyToSixty: { days: "31-60", cents: 0, count: 0 },
    sixtyToNinety: { days: "61-90", cents: 0, count: 0 },
    over90: { days: "90+", cents: 0, count: 0 },
  };

  for (const inv of invoices) {
    const daysOverdue = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24));
    const outstanding = inv.amountCents - (inv.paidCents ?? 0);

    if (daysOverdue <= 30) {
      aged.current.cents += outstanding;
      aged.current.count += 1;
    } else if (daysOverdue <= 60) {
      aged.thirtyToSixty.cents += outstanding;
      aged.thirtyToSixty.count += 1;
    } else if (daysOverdue <= 90) {
      aged.sixtyToNinety.cents += outstanding;
      aged.sixtyToNinety.count += 1;
    } else {
      aged.over90.cents += outstanding;
      aged.over90.count += 1;
    }
  }

  return {
    title: "Accounts Receivable Aging",
    date: now,
    buckets: [aged.current, aged.thirtyToSixty, aged.sixtyToNinety, aged.over90],
    totalCents: Object.values(aged).reduce((sum, b) => sum + b.cents, 0),
  };
}

export async function generateAPAgingReport(tenantId: string) {
  // Vendor payables
  const expenses = await prisma.expense.findMany({
    where: {
      tenantId,
      status: "APPROVED",
      reimbursedAt: null,
    },
  });

  const now = new Date();
  const aged = {
    current: { days: "0-30", cents: 0, count: 0 },
    thirtyToSixty: { days: "31-60", cents: 0, count: 0 },
    sixtyToNinety: { days: "61-90", cents: 0, count: 0 },
    over90: { days: "90+", cents: 0, count: 0 },
  };

  for (const exp of expenses) {
    const daysSinceBilled = Math.floor((now.getTime() - new Date(exp.date).getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceBilled <= 30) {
      aged.current.cents += exp.amountCents;
      aged.current.count += 1;
    } else if (daysSinceBilled <= 60) {
      aged.thirtyToSixty.cents += exp.amountCents;
      aged.thirtyToSixty.count += 1;
    } else if (daysSinceBilled <= 90) {
      aged.sixtyToNinety.cents += exp.amountCents;
      aged.sixtyToNinety.count += 1;
    } else {
      aged.over90.cents += exp.amountCents;
      aged.over90.count += 1;
    }
  }

  return {
    title: "Accounts Payable Aging",
    date: now,
    buckets: [aged.current, aged.thirtyToSixty, aged.sixtyToNinety, aged.over90],
    totalCents: Object.values(aged).reduce((sum, b) => sum + b.cents, 0),
  };
}

export async function generateBalanceSheetReport(tenantId: string, asOfDate: Date) {
  const sheet = await generateBalanceSheet(tenantId, asOfDate);

  return {
    title: "Balance Sheet",
    asOfDate,
    assets: { label: "Total Assets", cents: sheet.assets },
    liabilities: { label: "Total Liabilities", cents: sheet.liabilities },
    equity: { label: "Total Equity", cents: sheet.equity },
    balanced: sheet.balanced,
  };
}

export async function generateTrialBalanceReport(tenantId: string, asOfDate: Date) {
  const tb = await generateTrialBalance(tenantId, asOfDate);

  return {
    title: "Trial Balance",
    asOfDate,
    rows: tb.rows,
    totalDebitsCents: tb.totalDebitsCents,
    totalCreditsCents: tb.totalCreditsCents,
    balanced: tb.balanced,
  };
}

export async function exportReportToPDF(reportData: unknown): Promise<Buffer> {
  // In production, use a PDF library like pdfkit or puppeteer
  // For now, return a placeholder
  return Buffer.from(JSON.stringify(reportData, null, 2));
}

export async function exportReportToCSV(reportData: unknown): Promise<string> {
  // Convert report data to CSV format
  return JSON.stringify(reportData, null, 2);
}

export async function exportReportToExcel(reportData: unknown): Promise<Buffer> {
  // In production, use a library like xlsx
  return Buffer.from(JSON.stringify(reportData, null, 2));
}
