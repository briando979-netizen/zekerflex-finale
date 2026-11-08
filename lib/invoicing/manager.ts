import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const invoiceSchema = z.object({
  invoiceNumber: z.string().min(1),
  issuerId: z.string(),
  recipientId: z.string(),
  issuedAt: z.coerce.date(),
  dueDate: z.coerce.date(),
  amountCents: z.number().int().positive(),
  currencyCode: z.string().default("EUR"),
  description: z.string().optional(),
  paymentTerms: z.enum(["IMMEDIATE", "NET_15", "NET_30", "NET_60", "NET_90"]).default("NET_30"),
  recurringFrequency: z.enum(["ONCE", "MONTHLY", "QUARTERLY", "ANNUALLY"]).default("ONCE"),
  lineItems: z.array(z.object({
    description: z.string(),
    quantityCents: z.number().int().positive(),
    unitPriceCents: z.number().int().positive(),
  })).optional(),
});

type InvoiceInput = z.infer<typeof invoiceSchema>;

export async function createInvoice(data: InvoiceInput) {
  const validated = invoiceSchema.parse(data);

  const nextNumber = await getNextInvoiceNumber(validated.issuerId);

  return prisma.invoice.create({
    data: {
      invoiceNumber: nextNumber,
      issuerId: validated.issuerId,
      recipientId: validated.recipientId,
      issuedAt: validated.issuedAt,
      dueDate: validated.dueDate,
      amountCents: validated.amountCents,
      currencyCode: validated.currencyCode,
      description: validated.description,
      paymentTerms: validated.paymentTerms,
      recurringFrequency: validated.recurringFrequency,
      status: "DRAFT",
    },
  });
}

export async function sendInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: "SENT",
      sentAt: new Date(),
    },
  });

  // Send email notification
  return invoice;
}

export async function recordPayment(invoiceId: string, amountCents: number) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) throw new Error("Invoice not found");

  const paidCents = (invoice.paidCents ?? 0) + amountCents;
  const status = paidCents >= invoice.amountCents ? "PAID" : "PARTIALLY_PAID";

  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      paidCents,
      status,
      paidAt: status === "PAID" ? new Date() : undefined,
    },
  });
}

export async function getNextInvoiceNumber(tenantId: string): Promise<string> {
  const lastInvoice = await prisma.invoice.findFirst({
    where: { issuerId: tenantId },
    orderBy: { invoiceNumber: "desc" },
    take: 1,
  });

  if (!lastInvoice) return "INV-001";

  const num = parseInt(lastInvoice.invoiceNumber.split("-")[1] ?? "0", 10) + 1;
  return `INV-${String(num).padStart(3, "0")}`;
}

export async function getInvoicesByTenant(tenantId: string, role: "issuer" | "recipient") {
  const where: Prisma.InvoiceWhereInput = role === "issuer"
    ? { issuerId: tenantId }
    : { recipientId: tenantId };

  return prisma.invoice.findMany({
    where,
    orderBy: { issuedAt: "desc" },
  });
}

export async function calculateOverdue(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice || invoice.status === "PAID") return 0;

  const now = new Date();
  const dueDate = new Date(invoice.dueDate);

  if (now > dueDate) {
    const daysPastDue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysPastDue;
  }

  return 0;
}

export async function applyLateFeeCents(invoiceId: string, feeCents: number) {
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      amountCents: {
        increment: feeCents,
      },
    },
  });
}
