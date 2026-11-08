import { prisma } from "@/lib/prisma";
import { z } from "zod";

const QuoteLineSchema = z.object({
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discount: z.number().nonnegative().optional(),
  taxRate: z.number().nonnegative().optional(),
});

export async function generateQuote(data: {
  proposalId: string;
  lines: z.infer<typeof QuoteLineSchema>[];
  taxRate?: number;
  currency: string;
}) {
  const lines = data.lines.map(QuoteLineSchema.parse);

  let subtotal = 0;
  const calculatedLines = lines.map(line => {
    const lineTotal = line.quantity * line.unitPrice;
    const discountAmount = line.discount ? lineTotal * (line.discount / 100) : 0;
    const taxableAmount = lineTotal - discountAmount;
    const tax = line.taxRate ? taxableAmount * (line.taxRate / 100) : 0;
    const total = taxableAmount + tax;
    subtotal += total;

    return {
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount || 0,
      tax: tax,
      total: total,
    };
  });

  return prisma.quote.create({
    data: {
      proposalId: data.proposalId,
      lines: JSON.stringify(calculatedLines),
      subtotal,
      taxAmount: calculatedLines.reduce((sum, line) => sum + line.tax, 0),
      total: subtotal,
      currency: data.currency,
    },
  });
}

export async function updateQuoteLines(quoteId: string, lines: z.infer<typeof QuoteLineSchema>[]) {
  const validated = lines.map(QuoteLineSchema.parse);
  let total = 0;

  const calculated = validated.map(line => {
    const lineTotal = line.quantity * line.unitPrice * (1 - (line.discount || 0) / 100);
    const withTax = lineTotal * (1 + (line.taxRate || 0) / 100);
    total += withTax;
    return { ...line, total: withTax };
  });

  return prisma.quote.update({
    where: { id: quoteId },
    data: {
      lines: JSON.stringify(calculated),
      total,
      taxAmount: calculated.reduce((sum, line) => sum + (line.quantity * line.unitPrice * (line.taxRate || 0) / 100), 0),
    },
  });
}

export async function getQuote(id: string) {
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) return null;
  return {
    ...quote,
    lines: JSON.parse(quote.lines as string),
  };
}

export async function applyDiscount(quoteId: string, discountPercent: number) {
  const quote = await getQuote(quoteId);
  if (!quote) throw new Error("Quote not found");

  const discountAmount = quote.total * (discountPercent / 100);
  return prisma.quote.update({
    where: { id: quoteId },
    data: {
      total: quote.total - discountAmount,
      discountAmount,
    },
  });
}
