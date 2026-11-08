/**
 * Financial Reporting Subsystem
 * P&L statements, cash flow analysis, tax summaries
 */

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { getTenantExpenses, getExpenseTotals } from "@/lib/billing/expense-tracking";

export interface ProfitLossStatement {
  period: {
    startDate: Date;
    endDate: Date;
  };
  revenue: {
    invoiced: number;
    collected: number;
  };
  costs: {
    stripeFees: number;
    payoutFees: number;
    commission: number;
    otherExpenses: number;
    total: number;
  };
  profit: {
    gross: number; // revenue - direct costs
    net: number; // after all expenses
  };
}

export interface CashFlowAnalysis {
  period: {
    startDate: Date;
    endDate: Date;
  };
  inflows: {
    paymentsReceived: number;
    creditsMelting: number;
    refunds: number;
    total: number;
  };
  outflows: {
    payouts: number;
    expenses: number;
    refundsIssued: number;
    total: number;
  };
  netCashFlow: number;
}

export interface TaxSummary {
  year: number;
  taxableIncome: number;
  deductibleExpenses: number;
  taxableProfit: number;
  estimatedTaxLiability: number;
  vatCollected: number;
  vatPaid: number;
  vatNetLiability: number;
}

/** Generate P&L for a tenant in a period */
export async function generateProfitLossStatement(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<ProfitLossStatement> {
  // Revenue from issued invoices
  const invoices = await prisma.invoice.findMany({
    where: {
      recipientTenantId: tenantId,
      issuedAt: { gte: startDate, lte: endDate },
      type: "PLATFORM_FEE",
    },
  });

  const invoicedCents = invoices.reduce((sum, inv) => sum + inv.totalCents, 0);
  const collectedCents = invoices
    .filter((inv) => inv.status === "PAID")
    .reduce((sum, inv) => sum + inv.totalCents, 0);

  // Expenses by category
  const expenses = await getTenantExpenses(
    tenantId,
    startDate,
    endDate,
    "STRIPE_FEES",
  );
  const stripeFeesCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);

  const payoutExpenses = await getTenantExpenses(
    tenantId,
    startDate,
    endDate,
    "PAYOUT_FEES",
  );
  const payoutFeesCents = payoutExpenses.reduce(
    (sum, e) => sum + e.amountCents,
    0,
  );

  const commissionExpenses = await getTenantExpenses(
    tenantId,
    startDate,
    endDate,
    "COMMISSION",
  );
  const commissionCents = commissionExpenses.reduce(
    (sum, e) => sum + e.amountCents,
    0,
  );

  // Other operating expenses
  const allExpenses = await getTenantExpenses(tenantId, startDate, endDate);
  const otherExpensesCents = allExpenses
    .filter(
      (e) =>
        !["STRIPE_FEES", "PAYOUT_FEES", "COMMISSION"].includes(e.category),
    )
    .reduce((sum, e) => sum + e.amountCents, 0);

  const totalCostsCents =
    stripeFeesCents + payoutFeesCents + commissionCents + otherExpensesCents;

  return {
    period: { startDate, endDate },
    revenue: {
      invoiced: invoicedCents,
      collected: collectedCents,
    },
    costs: {
      stripeFees: stripeFeesCents,
      payoutFees: payoutFeesCents,
      commission: commissionCents,
      otherExpenses: otherExpensesCents,
      total: totalCostsCents,
    },
    profit: {
      gross: invoicedCents - commissionCents,
      net: invoicedCents - totalCostsCents,
    },
  };
}

/** Analyze cash flow movements */
export async function analyzeCashFlow(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<CashFlowAnalysis> {
  // Payments received (SETTLED status)
  const settledPayments = await prisma.payment.findMany({
    where: {
      invoice: { recipientTenantId: tenantId },
      status: "SETTLED",
      settledAt: { gte: startDate, lte: endDate },
    },
  });

  const paymentsReceivedCents = settledPayments.reduce(
    (sum, p) => sum + p.amountCents,
    0,
  );

  // Credits applied
  const appliedCredits = await prisma.tenantCredit.findMany({
    where: {
      tenantId,
      appliedAt: { gte: startDate, lte: endDate },
    },
  });

  const creditsMeltingCents = appliedCredits.reduce(
    (sum, c) => sum + c.amountCents,
    0,
  );

  // Refunds issued (negative outflow)
  const refunds = await prisma.payment.findMany({
    where: {
      invoice: { recipientTenantId: tenantId },
      status: "FAILED", // proxy for refunded (improve in production)
    },
  });

  const refundsIssuedCents = refunds.reduce(
    (sum, p) => sum + p.amountCents,
    0,
  );

  // Payouts (freelancer payments) - not directly in Payment model in current schema
  // In production, query separate Payout table
  const payoutsCents = 0;

  // Operating expenses
  const expenses = await getTenantExpenses(tenantId, startDate, endDate);
  const expensesCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);

  const totalInflows = paymentsReceivedCents + creditsMeltingCents;
  const totalOutflows = payoutsCents + expensesCents + refundsIssuedCents;
  const netCashFlow = totalInflows - totalOutflows;

  return {
    period: { startDate, endDate },
    inflows: {
      paymentsReceived: paymentsReceivedCents,
      creditsMelting: creditsMeltingCents,
      refunds: refundsIssuedCents,
      total: totalInflows,
    },
    outflows: {
      payouts: payoutsCents,
      expenses: expensesCents,
      refundsIssued: refundsIssuedCents,
      total: totalOutflows,
    },
    netCashFlow,
  };
}

/** Generate tax summary for the year */
export async function generateTaxSummary(
  tenantId: string,
  year: number,
): Promise<TaxSummary> {
  const startDate = new Date(`${year}-01-01`);
  const endDate = new Date(`${year + 1}-01-01`);

  // Revenue
  const paidInvoices = await prisma.invoice.findMany({
    where: {
      recipientTenantId: tenantId,
      status: "PAID",
      issuedAt: { gte: startDate, lt: endDate },
    },
  });

  const totalRevenueWeCents = paidInvoices.reduce(
    (sum, inv) => sum + inv.totalCents,
    0,
  );

  // Deductible expenses (using expense categories)
  const expenseTotals = await getExpenseTotals(tenantId, startDate, endDate);

  let deductibleExpensesCents = 0;
  for (const et of expenseTotals) {
    // Apply tax deductibility rules
    const deductibilityRates: Record<string, number> = {
      STRIPE_FEES: 1.0,
      PAYOUT_FEES: 1.0,
      COMMISSION: 1.0,
      TRAVEL: 0.8,
      MEALS: 0.5,
      SUPPLIES: 1.0,
      EQUIPMENT: 1.0,
      UTILITIES: 0.6,
      OTHER: 0.5,
    };

    const rate = deductibilityRates[et.category] ?? 0.5;
    deductibleExpensesCents += Math.round(et.totalCents * rate);
  }

  // VAT analysis
  const vatSummary = await getVatSummary(tenantId, year);

  const taxableProfit = Math.max(
    0,
    totalRevenueWeCents - deductibleExpensesCents,
  );

  // Dutch income tax (simplified, actual rate depends on business structure)
  const estimatedTaxLiabilityCents = Math.round(taxableProfit * 0.19); // approx. corporate rate

  return {
    year,
    taxableIncome: totalRevenueWeCents,
    deductibleExpenses: deductibleExpensesCents,
    taxableProfit,
    estimatedTaxLiability: estimatedTaxLiabilityCents,
    vatCollected: vatSummary.collected,
    vatPaid: vatSummary.paid,
    vatNetLiability: vatSummary.netLiability,
  };
}

/** Analyze VAT collected and paid */
async function getVatSummary(
  tenantId: string,
  year: number,
): Promise<{ collected: number; paid: number; netLiability: number }> {
  const startDate = new Date(`${year}-01-01`);
  const endDate = new Date(`${year + 1}-01-01`);

  // VAT collected on invoices issued to customers
  const outgoingInvoices = await prisma.invoice.findMany({
    where: {
      issuerTenantId: tenantId,
      status: "PAID",
      issuedAt: { gte: startDate, lt: endDate },
    },
  });

  const vatCollectedCents = outgoingInvoices.reduce(
    (sum, inv) => sum + inv.vatCents,
    0,
  );

  // VAT paid on incoming invoices (purchases)
  const incomingInvoices = await prisma.invoice.findMany({
    where: {
      recipientTenantId: tenantId,
      status: "PAID",
      issuedAt: { gte: startDate, lt: endDate },
    },
  });

  const vatPaidCents = incomingInvoices.reduce(
    (sum, inv) => sum + inv.vatCents,
    0,
  );

  const netLiability = vatCollectedCents - vatPaidCents;

  return {
    collected: vatCollectedCents,
    paid: vatPaidCents,
    netLiability,
  };
}

/** Export financial data in standardized format */
export async function exportFinancialData(
  tenantId: string,
  year: number,
  format: "JSON" | "CSV",
) {
  const pnl = await generateProfitLossStatement(
    tenantId,
    new Date(`${year}-01-01`),
    new Date(`${year}-12-31`),
  );

  const cashFlow = await analyzeCashFlow(
    tenantId,
    new Date(`${year}-01-01`),
    new Date(`${year}-12-31`),
  );

  const taxSummary = await generateTaxSummary(tenantId, year);

  if (format === "JSON") {
    return {
      profitAndLoss: pnl,
      cashFlow,
      taxSummary,
    };
  }

  // CSV format for Excel/spreadsheet import
  const lines = [
    "Financieel Rapport",
    `Periode: ${year}`,
    `Tenant: ${tenantId}`,
    "",
    "Winst & Verlies",
    "Opbrengsten (EUR)",
    `Gefactureerd,${(pnl.revenue.invoiced / 100).toFixed(2)}`,
    `Geïnd,${(pnl.revenue.collected / 100).toFixed(2)}`,
    "Kosten (EUR)",
    `Stripe-vergoedingen,${(pnl.costs.stripeFees / 100).toFixed(2)}`,
    `Uitbetalingsvergoedingen,${(pnl.costs.payoutFees / 100).toFixed(2)}`,
    `Commissie,${(pnl.costs.commission / 100).toFixed(2)}`,
    `Overige kosten,${(pnl.costs.otherExpenses / 100).toFixed(2)}`,
    `Totaal kosten,${(pnl.costs.total / 100).toFixed(2)}`,
    "Winst (EUR)",
    `Bruto,${(pnl.profit.gross / 100).toFixed(2)}`,
    `Netto,${(pnl.profit.net / 100).toFixed(2)}`,
  ];

  return lines.join("\n");
}
