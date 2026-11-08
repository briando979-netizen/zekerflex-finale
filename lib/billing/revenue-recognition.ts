/**
 * Revenue Recognition Subsystem
 * GAAP/IFRS compliance, revenue scheduling, multi-period recognition
 */

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export type RevenueRecognitionMethod =
  | "POINT_OF_SERVICE" // recognize at delivery
  | "OVER_TIME" // recognize ratably over period
  | "MILESTONE" // recognize on achievement
  | "SUBSCRIPTION"; // recognize monthly

export interface RevenueRecord {
  invoiceId: string;
  recognitionPeriod: {
    startDate: Date;
    endDate: Date;
  };
  recognitionMethod: RevenueRecognitionMethod;
  recognizedCents: number;
  recognizedDate?: Date;
  status: "PENDING" | "RECOGNIZED" | "REVERSED";
}

/** Create revenue recognition schedule for a subscription invoice */
export async function scheduleSubscriptionRevenue(
  invoiceId: string,
  totalCents: number,
  startDate: Date,
  endDate: Date,
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) {
    throw AppError.notFound("Factuur niet gevonden.");
  }

  // Calculate number of days in subscription period
  const daysInPeriod = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysInPeriod <= 0) {
    throw AppError.validation(
      "Erkenningsperiode moet positief aantal dagen zijn.",
    );
  }

  // Store revenue recognition schedule in JournalEntry + LedgerLines
  // Daily recognition: amountPerDay = totalCents / daysInPeriod
  const amountPerDay = Math.round(totalCents / daysInPeriod);
  const remainderCents = totalCents - amountPerDay * (daysInPeriod - 1); // Handle rounding

  let currentDate = new Date(startDate);
  let recognizedSoFarCents = 0;

  // Create daily recognition entries (in batches for efficiency)
  for (let i = 0; i < daysInPeriod; i++) {
    const dailyAmount = i === daysInPeriod - 1 ? remainderCents : amountPerDay;

    await createRevenueRecognitionEntry({
      invoiceId,
      recognitionDate: new Date(currentDate),
      recognizedCents: dailyAmount,
      method: "SUBSCRIPTION",
    });

    recognizedSoFarCents += dailyAmount;
    currentDate.setDate(currentDate.getDate() + 1);
  }
}

/** Create revenue recognition entry in journal */
export async function createRevenueRecognitionEntry(
  input: {
    invoiceId: string;
    recognitionDate: Date;
    recognizedCents: number;
    method: RevenueRecognitionMethod;
  },
): Promise<void> {
  if (input.recognizedCents <= 0) {
    throw AppError.validation(
      "Erkend bedrag moet positief zijn.",
    );
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
  });

  if (!invoice) {
    throw AppError.notFound("Factuur niet gevonden.");
  }

  // Create journal entry with revenue recognition
  const entry = await prisma.journalEntry.create({
    data: {
      tenantId: invoice.issuerTenantId || "platform",
      date: input.recognitionDate,
      description: `Revenues erkend (${input.method}) - Factuur ${invoice.number}`,
      referenceId: input.invoiceId,
      ledgerLines: {
        create: [
          {
            // Debit: Accounts Receivable
            accountNumber: "1200",
            debitCents: input.recognizedCents,
            creditCents: 0,
          },
          {
            // Credit: Revenue
            accountNumber: "4000",
            debitCents: 0,
            creditCents: input.recognizedCents,
          },
        ],
      },
    },
    include: { ledgerLines: true },
  });

  return;
}

/** Get revenue recognition schedule for an invoice */
export async function getRevenueSchedule(invoiceId: string) {
  const entries = await prisma.journalEntry.findMany({
    where: {
      referenceId: invoiceId,
      description: { contains: "erkend" },
    },
    include: { ledgerLines: true },
    orderBy: { date: "asc" },
  });

  return entries.map((entry) => {
    const revenueLine = entry.ledgerLines.find((l) => l.accountNumber === "4000");
    return {
      date: entry.date,
      recognizedCents: revenueLine?.creditCents ?? 0,
      description: entry.description,
    };
  });
}

/** Calculate deferred revenue liability for multi-period contracts */
export async function calculateDeferredRevenue(
  invoiceId: string,
): Promise<number> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) {
    throw AppError.notFound("Factuur niet gevonden.");
  }

  const recognitionEntries = await getRevenueSchedule(invoiceId);
  const recognizedCents = recognitionEntries.reduce(
    (sum, r) => sum + r.recognizedCents,
    0,
  );

  // Deferred revenue = total invoice amount - recognized amount
  return invoice.totalCents - recognizedCents;
}

/** Recognize revenue on point of service (one-time deliverable) */
export async function recognizePointOfServiceRevenue(
  invoiceId: string,
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) {
    throw AppError.notFound("Factuur niet gevonden.");
  }

  // Immediately recognize the entire invoice amount
  await createRevenueRecognitionEntry({
    invoiceId,
    recognitionDate: invoice.issuedAt ?? new Date(),
    recognizedCents: invoice.totalCents,
    method: "POINT_OF_SERVICE",
  });
}

/** Recognize revenue by milestone achievement */
export async function recognizeMilestoneRevenue(
  invoiceId: string,
  milestonePercentage: number, // 0-100
): Promise<void> {
  if (milestonePercentage < 0 || milestonePercentage > 100) {
    throw AppError.validation(
      "Milestone percentage moet tussen 0 en 100 liggen.",
    );
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) {
    throw AppError.notFound("Factuur niet gevonden.");
  }

  const recognizableCents = Math.round(
    invoice.totalCents * (milestonePercentage / 100),
  );

  await createRevenueRecognitionEntry({
    invoiceId,
    recognitionDate: new Date(),
    recognizedCents: recognizableCents,
    method: "MILESTONE",
  });
}

/** Calculate monthly revenue recognition for annual contracts */
export function calculateMonthlyRecognition(
  totalCents: number,
  contractMonths: number,
): number {
  if (contractMonths <= 0) {
    throw AppError.validation("Contract periode moet positief zijn.");
  }

  const monthlyAmount = Math.round(totalCents / contractMonths);
  return monthlyAmount;
}

/** Reverse revenue recognition (for cancellations, returns) */
export async function reverseRevenueRecognition(
  invoiceId: string,
  reason: string,
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) {
    throw AppError.notFound("Factuur niet gevonden.");
  }

  // Create reversal entry
  const reversalEntry = await prisma.journalEntry.create({
    data: {
      tenantId: invoice.issuerTenantId || "platform",
      date: new Date(),
      description: `Terugboeking erkende inkomsten - Factuur ${invoice.number}: ${reason}`,
      referenceId: invoiceId,
      ledgerLines: {
        create: [
          {
            // Debit: Revenue (reversal)
            accountNumber: "4000",
            debitCents: invoice.totalCents,
            creditCents: 0,
          },
          {
            // Credit: Accounts Receivable (reversal)
            accountNumber: "1200",
            debitCents: 0,
            creditCents: invoice.totalCents,
          },
        ],
      },
    },
  });
}

/** Generate GAAP-compliant revenue report */
export async function generateRevenueReport(
  tenantId: string,
  startDate: Date,
  endDate: Date,
) {
  // Query all revenue recognition entries for the period
  const entries = await prisma.journalEntry.findMany({
    where: {
      tenantId,
      date: { gte: startDate, lte: endDate },
      description: { contains: "erkend" },
    },
    include: { ledgerLines: true },
  });

  // Calculate totals by recognition method
  const byMethod = new Map<string, number>();
  for (const entry of entries) {
    const method =
      entry.description.match(/\((.*?)\)/)?.[1] ?? "UNKNOWN";
    const revenueAmount =
      entry.ledgerLines.find((l) => l.accountNumber === "4000")?.creditCents ?? 0;
    const existing = byMethod.get(method) ?? 0;
    byMethod.set(method, existing + revenueAmount);
  }

  const totalRecognizedCents = Array.from(byMethod.values()).reduce(
    (a, b) => a + b,
    0,
  );

  return {
    period: { startDate, endDate },
    recognitionByMethod: Array.from(byMethod.entries()).map(
      ([method, amount]) => ({
        method,
        recognizedCents: amount,
      }),
    ),
    totalRecognizedCents,
    summary: {
      formatted: `€${(totalRecognizedCents / 100).toFixed(2)}`,
      message: `Totaal ${totalRecognizedCents / 100} van inkomsten erkend in deze periode`,
    },
  };
}

/** Calculate deferred revenue balance sheet item */
export async function calculateDeferredRevenueBalance(
  tenantId: string,
  asOfDate: Date,
) {
  // Find all invoices not yet fully recognized
  const invoices = await prisma.invoice.findMany({
    where: {
      issuerTenantId: tenantId,
      status: { in: ["ISSUED", "PAID"] },
      issuedAt: { lte: asOfDate },
    },
  });

  let totalDeferredCents = 0;

  for (const invoice of invoices) {
    const deferred = await calculateDeferredRevenue(invoice.id);
    totalDeferredCents += deferred;
  }

  return {
    asOfDate,
    deferredRevenueCents: totalDeferredCents,
    formatted: `€${(totalDeferredCents / 100).toFixed(2)}`,
  };
}
