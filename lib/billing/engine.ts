import { prisma } from "@/lib/prisma";
import { z } from "zod";

const BillingRateSchema = z.object({
  userId: z.string(),
  hourlyRate: z.number().positive(),
  clientId: z.string().optional(),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().optional(),
});

export async function calculateInvoiceAmount(
  userId: string,
  hours: number,
  startDate: Date,
  clientId?: string
): Promise<number> {
  const rate = await prisma.billingRate.findFirst({
    where: {
      userId,
      clientId,
      effectiveFrom: { lte: startDate },
      OR: [{ effectiveTo: { gte: startDate } }, { effectiveTo: null }],
    },
    orderBy: { effectiveFrom: "desc" },
  });

  return (rate?.hourlyRate || 0) * hours;
}

export async function createInvoice(data: {
  clientId: string;
  userId: string;
  hours: number;
  amount: number;
  invoiceDate: Date;
  dueDate: Date;
  description: string;
}) {
  return prisma.invoice.create({
    data: {
      clientId: data.clientId,
      userId: data.userId,
      amountCents: Math.round(data.amount * 100),
      hours: data.hours,
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate,
      description: data.description,
      status: "DRAFT",
    },
  });
}

export async function publishInvoice(invoiceId: string) {
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
}

export async function recordPayment(invoiceId: string, amount: number) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Invoice not found");

  const paid = invoice.paidCents + Math.round(amount * 100);
  const status = paid >= invoice.amountCents ? "PAID" : "PARTIAL";

  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { paidCents: paid, status, paidAt: status === "PAID" ? new Date() : null },
  });
}

export async function getClientRevenue(clientId: string, startDate: Date, endDate: Date) {
  const result = await prisma.invoice.aggregate({
    where: {
      clientId,
      invoiceDate: { gte: startDate, lte: endDate },
      status: { in: ["PUBLISHED", "PAID"] },
    },
    _sum: { amountCents: true },
  });
  return (result._sum.amountCents || 0) / 100;
}
