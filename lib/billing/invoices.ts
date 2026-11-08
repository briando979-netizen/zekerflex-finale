/**
 * Invoice Management Subsystem
 * Generates, manages, and exports invoices with itemization, tax, PDF support
 */

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { InvoiceType, InvoiceStatus, VatTreatment } from "@prisma/client";
import { z } from "zod";

export interface InvoiceLineItem {
  description: string;
  quantity: number; // hours
  unitPriceCents: number;
}

export interface InvoiceGenerationInput {
  type: InvoiceType;
  issuerTenantId?: string;
  recipientTenantId?: string;
  recipientFreelancerId?: string;
  timesheetId?: string;
  currency?: string;
  vatTreatment: VatTreatment;
  vatRate: number;
  lines: InvoiceLineItem[];
  issuedAt?: Date;
}

/** Calculate line totals and invoice aggregate */
export function calculateInvoiceTotals(
  lines: InvoiceLineItem[],
  vatRate: number,
): {
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
} {
  const subtotalCents = lines.reduce((sum, line) => {
    const lineTotalCents = Math.round(line.quantity * line.unitPriceCents);
    return sum + lineTotalCents;
  }, 0);

  const vatCents = Math.round(subtotalCents * vatRate);
  const totalCents = subtotalCents + vatCents;

  return { subtotalCents, vatCents, totalCents };
}

/** Generate next invoice number within a transaction */
export async function generateInvoiceNumber(
  type: InvoiceType,
  year: number,
): Promise<string> {
  const sequence = await prisma.invoiceSequence.upsert({
    where: { type_year: { type, year } },
    update: { lastValue: { increment: 1 } },
    create: { type, year, lastValue: 1 },
  });

  const paddedNumber = String(sequence.lastValue).padStart(6, "0");
  return `${type}-${year}-${paddedNumber}`;
}

/** Create a new invoice with validation */
export async function createInvoice(
  input: InvoiceGenerationInput,
): Promise<string> {
  const { subtotalCents, vatCents, totalCents } = calculateInvoiceTotals(
    input.lines,
    input.vatRate,
  );

  if (totalCents <= 0) {
    throw AppError.validation("Factuur moet een positief bedrag hebben.");
  }

  const now = new Date();
  const year = now.getFullYear();
  const number = await generateInvoiceNumber(input.type, year);

  const invoice = await prisma.invoice.create({
    data: {
      number,
      type: input.type,
      status: "DRAFT",
      issuerTenantId: input.issuerTenantId,
      recipientTenantId: input.recipientTenantId,
      recipientFreelancerId: input.recipientFreelancerId,
      timesheetId: input.timesheetId,
      currency: input.currency ?? "EUR",
      vatTreatment: input.vatTreatment,
      vatRate: input.vatRate,
      subtotalCents,
      vatCents,
      totalCents,
      issuedAt: input.issuedAt,
      lines: {
        create: input.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          amountCents: Math.round(line.quantity * line.unitPriceCents),
        })),
      },
    },
  });

  return invoice.id;
}

/** Transition invoice to ISSUED status */
export async function issueInvoice(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) {
    throw AppError.notFound("Factuur niet gevonden.");
  }

  if (invoice.status !== "DRAFT") {
    throw AppError.validation(
      `Kan alleen CONCEPT-facturen uitstellen. Huidige status: ${invoice.status}`,
    );
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: "ISSUED",
      issuedAt: new Date(),
    },
  });
}

/** Fetch invoice with full details */
export async function getInvoiceDetails(invoiceId: string) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: true,
      payment: true,
      timesheet: {
        include: {
          freelancer: true,
          branch: true,
        },
      },
      issuerTenant: true,
      recipientTenant: true,
      recipientFreelancer: true,
    },
  });
}

/** List invoices with filtering */
export async function listInvoices(options: {
  type?: InvoiceType;
  status?: InvoiceStatus;
  recipientTenantId?: string;
  limit?: number;
  offset?: number;
}) {
  return prisma.invoice.findMany({
    where: {
      ...(options.type && { type: options.type }),
      ...(options.status && { status: options.status }),
      ...(options.recipientTenantId && {
        recipientTenantId: options.recipientTenantId,
      }),
    },
    include: {
      lines: true,
      payment: true,
    },
    orderBy: { issuedAt: "desc" },
    take: options.limit ?? 50,
    skip: options.offset ?? 0,
  });
}

/** Mark invoice as paid */
export async function markInvoicePaid(
  invoiceId: string,
  paidAt: Date = new Date(),
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) {
    throw AppError.notFound("Factuur niet gevonden.");
  }

  if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
    throw AppError.validation(
      `Kan factuur niet opnieuw markeren als betaald. Status: ${invoice.status}`,
    );
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: "PAID",
      paidAt,
    },
  });
}

/** Cancel an invoice */
export async function cancelInvoice(
  invoiceId: string,
  reason?: string,
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) {
    throw AppError.notFound("Factuur niet gevonden.");
  }

  if (["PAID", "CANCELLED"].includes(invoice.status)) {
    throw AppError.validation(
      "Kan alleen concept- en uitgekomen facturen annuleren.",
    );
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: "CANCELLED",
    },
  });
}

/** Calculate tax totals for financial reporting */
export async function getInvoiceTaxSummary(options: {
  year: number;
  tenantId: string;
}) {
  const invoices = await prisma.invoice.findMany({
    where: {
      recipientTenantId: options.tenantId,
      status: "PAID",
      issuedAt: {
        gte: new Date(`${options.year}-01-01`),
        lt: new Date(`${options.year + 1}-01-01`),
      },
    },
  });

  const byVatRate = new Map<number, { subtotal: number; vat: number }>();
  for (const inv of invoices) {
    const key = inv.vatRate;
    const existing = byVatRate.get(key) ?? { subtotal: 0, vat: 0 };
    byVatRate.set(key, {
      subtotal: existing.subtotal + inv.subtotalCents,
      vat: existing.vat + inv.vatCents,
    });
  }

  return Array.from(byVatRate.entries()).map(([rate, totals]) => ({
    vatRate: rate,
    subtotalCents: totals.subtotal,
    vatCents: totals.vat,
  }));
}
