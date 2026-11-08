import { prisma } from "@/lib/prisma";
import { z } from "zod";

const journalEntrySchema = z.object({
  tenantId: z.string(),
  date: z.coerce.date(),
  description: z.string(),
  referenceId: z.string().optional(),
  entries: z.array(z.object({
    accountNumber: z.string(), // e.g., "1000" for Assets
    debitCents: z.number().int().min(0),
    creditCents: z.number().int().min(0),
  })),
});

type JournalEntryInput = z.infer<typeof journalEntrySchema>;

// Chart of accounts
const CHART_OF_ACCOUNTS = {
  "1000": { name: "Assets", type: "ASSET" },
  "1100": { name: "Cash", type: "ASSET" },
  "1200": { name: "Accounts Receivable", type: "ASSET" },
  "1300": { name: "Inventory", type: "ASSET" },
  "2000": { name: "Liabilities", type: "LIABILITY" },
  "2100": { name: "Accounts Payable", type: "LIABILITY" },
  "2200": { name: "Short-term Debt", type: "LIABILITY" },
  "3000": { name: "Equity", type: "EQUITY" },
  "3100": { name: "Retained Earnings", type: "EQUITY" },
  "4000": { name: "Revenue", type: "REVENUE" },
  "4100": { name: "Service Revenue", type: "REVENUE" },
  "5000": { name: "Expenses", type: "EXPENSE" },
  "5100": { name: "Cost of Goods Sold", type: "EXPENSE" },
  "5200": { name: "Salaries & Wages", type: "EXPENSE" },
  "5300": { name: "Utilities", type: "EXPENSE" },
  "5400": { name: "Depreciation", type: "EXPENSE" },
};

export async function postJournalEntry(data: JournalEntryInput) {
  const validated = journalEntrySchema.parse(data);

  // Verify debits = credits
  const totalDebits = validated.entries.reduce((sum, e) => sum + e.debitCents, 0);
  const totalCredits = validated.entries.reduce((sum, e) => sum + e.creditCents, 0);

  if (totalDebits !== totalCredits) {
    throw new Error("Debits do not equal credits");
  }

  const entry = await prisma.journalEntry.create({
    data: {
      tenantId: validated.tenantId,
      date: validated.date,
      description: validated.description,
      referenceId: validated.referenceId,
    },
  });

  // Create ledger lines
  for (const item of validated.entries) {
    await prisma.ledgerLine.create({
      data: {
        entryId: entry.id,
        accountNumber: item.accountNumber,
        debitCents: item.debitCents,
        creditCents: item.creditCents,
      },
    });
  }

  return entry;
}

export async function getAccountBalance(tenantId: string, accountNumber: string, asOfDate: Date) {
  const lines = await prisma.ledgerLine.findMany({
    where: {
      entry: {
        tenantId,
        date: { lte: asOfDate },
      },
      accountNumber,
    },
  });

  const debits = lines.reduce((sum, l) => sum + l.debitCents, 0);
  const credits = lines.reduce((sum, l) => sum + l.creditCents, 0);

  const account = CHART_OF_ACCOUNTS[accountNumber as keyof typeof CHART_OF_ACCOUNTS];
  const balance = account?.type === "EXPENSE" || account?.type === "ASSET"
    ? debits - credits
    : credits - debits;

  return { balance, debits, credits };
}

export async function generateTrialBalance(tenantId: string, asOfDate: Date) {
  const entries = await prisma.journalEntry.findMany({
    where: {
      tenantId,
      date: { lte: asOfDate },
    },
    include: { ledgerLines: true },
  });

  const accounts = new Map<string, { debits: number; credits: number }>();

  for (const entry of entries) {
    for (const line of entry.ledgerLines) {
      if (!accounts.has(line.accountNumber)) {
        accounts.set(line.accountNumber, { debits: 0, credits: 0 });
      }
      const acc = accounts.get(line.accountNumber)!;
      acc.debits += line.debitCents;
      acc.credits += line.creditCents;
    }
  }

  const rows = Array.from(accounts.entries()).map(([acctNum, { debits, credits }]) => ({
    account: acctNum,
    accountName: CHART_OF_ACCOUNTS[acctNum as keyof typeof CHART_OF_ACCOUNTS]?.name ?? "Unknown",
    debitsCents: debits,
    creditsCents: credits,
  }));

  const totalDebits = rows.reduce((sum, r) => sum + r.debitsCents, 0);
  const totalCredits = rows.reduce((sum, r) => sum + r.creditsCents, 0);

  return { rows, totalDebitsCents: totalDebits, totalCreditsCents: totalCredits, balanced: totalDebits === totalCredits };
}

export async function generateIncomeStatement(tenantId: string, startDate: Date, endDate: Date) {
  const revenue = await getAccountBalance(tenantId, "4100", endDate);
  const cogs = await getAccountBalance(tenantId, "5100", endDate);
  const salaries = await getAccountBalance(tenantId, "5200", endDate);
  const utilities = await getAccountBalance(tenantId, "5300", endDate);

  const grossProfit = revenue.balance - cogs.balance;
  const operatingExpenses = salaries.balance + utilities.balance;
  const netIncome = grossProfit - operatingExpenses;

  return {
    revenue: revenue.balance,
    costOfGoodsSold: cogs.balance,
    grossProfit,
    operatingExpenses,
    netIncome,
    period: { start: startDate, end: endDate },
  };
}

export async function generateBalanceSheet(tenantId: string, asOfDate: Date) {
  const assets = await getAccountBalance(tenantId, "1000", asOfDate);
  const liabilities = await getAccountBalance(tenantId, "2000", asOfDate);
  const equity = await getAccountBalance(tenantId, "3000", asOfDate);

  return {
    assets: assets.balance,
    liabilities: liabilities.balance,
    equity: equity.balance,
    balanced: assets.balance === liabilities.balance + equity.balance,
    date: asOfDate,
  };
}

export function getChartOfAccounts() {
  return CHART_OF_ACCOUNTS;
}
