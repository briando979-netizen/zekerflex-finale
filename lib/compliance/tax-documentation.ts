import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const taxDocSchema = z.object({
  freelancerId: z.string(),
  documentType: z.enum(['INVOICE', 'TAX_FORM', 'DEDUCTION_SUMMARY', 'QUARTERLY_REPORT', 'ANNUAL_TAX_RETURN']),
  period: z.string(), // YYYY-MM or YYYY-Q
  grossIncome: z.number(),
  deductions: z.number(),
  taxableIncome: z.number(),
  taxesPaid: z.number(),
  status: z.enum(['DRAFT', 'GENERATED', 'REVIEWED', 'FILED', 'REJECTED']),
});

export async function generateInvoice(freelancerId: string, data: {
  amount: number;
  description: string;
  invoiceDate: Date;
  dueDate: Date;
}) {
  const freelancer = await prisma.freelancerProfile.findUnique({
    where: { userId: freelancerId },
    include: { user: true },
  });

  if (!freelancer) throw new Error('Freelancer not found');

  const invoiceNumber = await generateInvoiceNumber();

  return await prisma.taxDocument.create({
    data: {
      freelancerId,
      documentType: 'INVOICE',
      period: new Date().toISOString().slice(0, 7),
      grossIncome: data.amount,
      deductions: 0,
      taxableIncome: data.amount,
      taxesPaid: 0,
      status: 'GENERATED',
      content: JSON.stringify({
        invoiceNumber,
        freelancerName: freelancer.user.name,
        amount: data.amount,
        description: data.description,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
      }),
    },
  });
}

export async function generateTaxForm(freelancerId: string, year: number) {
  const income = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM "Invoice"
    WHERE "recipientId" = ${freelancerId}
    AND EXTRACT(YEAR FROM "createdAt") = ${year}
  `;

  const totalIncome = Number(income[0]?.total || 0);
  const deductions = Math.round(totalIncome * 0.12); // 12% deduction estimate
  const taxableIncome = totalIncome - deductions;

  return await prisma.taxDocument.create({
    data: {
      freelancerId,
      documentType: 'TAX_FORM',
      period: String(year),
      grossIncome: totalIncome,
      deductions,
      taxableIncome,
      taxesPaid: 0,
      status: 'GENERATED',
    },
  });
}

export async function getDeductionSummary(freelancerId: string, year: number) {
  const expenses = await prisma.expenseLog.findMany({
    where: {
      freelancerId,
      createdAt: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    },
  });

  const totalDeductions = expenses.reduce((sum, e) => sum + e.amount, 0);

  return {
    year,
    expenses,
    totalDeductions,
  };
}

async function generateInvoiceNumber(): Promise<string> {
  const count = await prisma.taxDocument.count({
    where: { documentType: 'INVOICE' },
  });
  return `INV-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
}
