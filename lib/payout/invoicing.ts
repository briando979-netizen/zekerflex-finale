import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const invoiceSchema = z.object({
  payoutId: z.string(),
  freelancerId: z.string(),
  invoiceNumber: z.string(),
  issueDate: z.date(),
  dueDate: z.date(),
  items: z.array(z.object({
    description: z.string(),
    amount: z.number(),
    quantity: z.number(),
  })),
});

export type InvoiceRequest = z.infer<typeof invoiceSchema>;

export async function generateInvoice(req: InvoiceRequest) {
  const validated = invoiceSchema.parse(req);

  const freelancer = await prisma.freelancerProfile.findUnique({
    where: { userId: validated.freelancerId },
  });

  if (!freelancer) throw new Error('Freelancer not found');

  const totalAmount = validated.items.reduce((sum, item) => sum + item.amount * item.quantity, 0);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: validated.invoiceNumber,
      freelancerId: validated.freelancerId,
      payoutId: validated.payoutId,
      issueDate: validated.issueDate,
      dueDate: validated.dueDate,
      totalAmount,
      status: 'ISSUED',
    },
  });

  // Create invoice line items
  for (const item of validated.items) {
    await prisma.invoiceLineItem.create({
      data: {
        invoiceId: invoice.id,
        description: item.description,
        unitAmount: item.amount,
        quantity: item.quantity,
        totalAmount: item.amount * item.quantity,
      },
    });
  }

  return invoice;
}

export async function generateInvoicePDF(invoiceId: string): Promise<Buffer> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lineItems: true, freelancer: true },
  });

  if (!invoice) throw new Error('Invoice not found');

  // In production: use PDFKit or similar
  // For now: return placeholder
  return Buffer.from(
    `INVOICE #${invoice.invoiceNumber}\n${invoice.issueDate.toLocaleDateString()}\nTotal: €${invoice.totalAmount}`
  );
}

export async function archiveInvoice(invoiceId: string) {
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });
}

export async function getInvoicesByFreelancer(freelancerId: string) {
  return prisma.invoice.findMany({
    where: { freelancerId },
    include: { lineItems: true },
    orderBy: { issueDate: 'desc' },
  });
}
