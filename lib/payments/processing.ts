import { prisma } from "@/lib/prisma";
import { z } from "zod";

const paymentSchema = z.object({
  invoiceId: z.string(),
  amountCents: z.number().int().positive(),
  paymentMethod: z.enum(["BANK_TRANSFER", "CARD", "CASH", "CHECK"]),
  reference: z.string().optional(),
  paidAt: z.coerce.date().default(() => new Date()),
});

type PaymentInput = z.infer<typeof paymentSchema>;

export async function recordPayment(data: PaymentInput) {
  const validated = paymentSchema.parse(data);

  const invoice = await prisma.invoice.findUnique({
    where: { id: validated.invoiceId },
  });

  if (!invoice) throw new Error("Invoice not found");

  const paidCents = (invoice.paidCents ?? 0) + validated.amountCents;
  const status = paidCents >= invoice.amountCents ? "PAID" : "PARTIALLY_PAID";

  const payment = await prisma.payment.create({
    data: {
      invoiceId: validated.invoiceId,
      amountCents: validated.amountCents,
      paymentMethod: validated.paymentMethod,
      reference: validated.reference,
      paidAt: validated.paidAt,
    },
  });

  await prisma.invoice.update({
    where: { id: validated.invoiceId },
    data: {
      paidCents,
      status,
      paidAt: status === "PAID" ? validated.paidAt : undefined,
    },
  });

  return payment;
}

export async function sendPaymentReminder(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice || invoice.status === "PAID") return null;

  return prisma.paymentReminder.create({
    data: {
      invoiceId,
      sentAt: new Date(),
    },
  });
}

export async function processRefund(invoiceId: string, refundAmountCents: number, reason: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) throw new Error("Invoice not found");

  const newPaidAmount = Math.max(0, (invoice.paidCents ?? 0) - refundAmountCents);

  const refund = await prisma.refund.create({
    data: {
      invoiceId,
      amountCents: refundAmountCents,
      reason,
      processedAt: new Date(),
    },
  });

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      paidCents: newPaidAmount,
      status: newPaidAmount > 0 ? "PARTIALLY_PAID" : "UNPAID",
    },
  });

  return refund;
}

export async function reconcilePayments(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });

  if (!invoice) throw new Error("Invoice not found");

  const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amountCents, 0);

  const reconciled = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      paidCents: totalPaid,
      status: totalPaid >= invoice.amountCents ? "PAID" : totalPaid > 0 ? "PARTIALLY_PAID" : "UNPAID",
    },
  });

  return reconciled;
}

export async function getOutstandingInvoices(tenantId: string) {
  return prisma.invoice.findMany({
    where: {
      recipientId: tenantId,
      status: { in: ["UNPAID", "PARTIALLY_PAID"] },
    },
    include: {
      _count: {
        select: { reminders: true },
      },
    },
    orderBy: { dueDate: "asc" },
  });
}

export async function getAgedReceivables(tenantId: string) {
  const invoices = await prisma.invoice.findMany({
    where: {
      issuerId: tenantId,
      status: { in: ["UNPAID", "PARTIALLY_PAID"] },
    },
  });

  const now = new Date();
  const aged = {
    current: 0,
    thirtyDays: 0,
    sixtyDays: 0,
    ninetyDays: 0,
    over90Days: 0,
  };

  for (const inv of invoices) {
    const daysOverdue = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24));
    const outstanding = inv.amountCents - (inv.paidCents ?? 0);

    if (daysOverdue <= 0) aged.current += outstanding;
    else if (daysOverdue <= 30) aged.thirtyDays += outstanding;
    else if (daysOverdue <= 60) aged.sixtyDays += outstanding;
    else if (daysOverdue <= 90) aged.ninetyDays += outstanding;
    else aged.over90Days += outstanding;
  }

  return aged;
}

export async function applyLateFee(invoiceId: string, ratePct = 1.5) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice || invoice.status === "PAID") return null;

  const lateFee = Math.round((invoice.amountCents - (invoice.paidCents ?? 0)) * (ratePct / 100));

  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      amountCents: {
        increment: lateFee,
      },
    },
  });
}

export async function getPaymentHistory(invoiceId: string) {
  return prisma.payment.findMany({
    where: { invoiceId },
    orderBy: { paidAt: "desc" },
  });
}
