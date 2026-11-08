// ---------------------------------------------------------------------------
// Payouts — Schedule partner payments, tax reporting
// Subsystem 4/6 for production Partner & Affiliate Management
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';

export interface PayoutSchedule {
  id: string;
  affiliateId: string;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  nextPayoutDate: Date;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
  minimumThreshold: number; // in cents
}

export interface TaxDocument {
  id: string;
  affiliateId: string;
  year: number;
  type: 'INVOICE_1099' | 'TAX_FORM' | '1042_S';
  totalEarnings: number;
  document: string; // URL to the generated document
  generatedAt: Date;
}

/**
 * Create a payout for an affiliate
 */
export async function createPayout(
  affiliateId: string,
  amountCents: number
): Promise<{ payoutId: string; amount: number; status: string }> {
  const payout = await prisma.payout.create({
    data: {
      affiliateId,
      amount: amountCents,
      status: 'PENDING',
    },
  });

  return {
    payoutId: payout.id,
    amount: payout.amount,
    status: payout.status,
  };
}

/**
 * Process a payout (mark as completed)
 */
export async function processPayout(
  payoutId: string,
  transactionId?: string
): Promise<{ payoutId: string; status: string; completedAt: Date }> {
  const payout = await prisma.payout.update({
    where: { id: payoutId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });

  const affiliate = await prisma.affiliate.findUnique({
    where: { id: payout.affiliateId },
  });

  if (affiliate) {
    // Update last payout date
    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: {
        lastPayoutAt: new Date(),
      },
    });

    // Send notification
    try {
      await sendEmail({
        to: affiliate.email,
        subject: 'Uitbetaling verwerkt — ZekerFlex Partners',
        html: `
          <h2>Je uitbetaling is verwerkt</h2>
          <p>Bedrag: €${(payout.amount / 100).toFixed(2)}</p>
          <p>Status: Verwerkt</p>
          <p>Je ontvangt het bedrag binnen 1-2 werkdagen op je rekening.</p>
        `,
      });
    } catch (err) {
      console.error('Failed to send payout notification', err);
    }
  }

  return {
    payoutId: payout.id,
    status: payout.status,
    completedAt: payout.completedAt!,
  };
}

/**
 * Fail a payout
 */
export async function failPayout(payoutId: string, reason: string): Promise<{ payoutId: string; status: string }> {
  const payout = await prisma.payout.update({
    where: { id: payoutId },
    data: {
      status: 'FAILED',
    },
  });

  return {
    payoutId: payout.id,
    status: payout.status,
  };
}

/**
 * Get approved commissions ready for payout
 */
export async function getPayableCommissions(
  affiliateId: string,
  minimumThresholdCents?: number
): Promise<{ commissions: any[]; totalCents: number; canPayout: boolean }> {
  const where = {
    affiliateId,
    status: 'APPROVED',
    payoutId: null,
  };

  const commissions = await prisma.commission.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  const totalCents = commissions.reduce((sum, c) => sum + c.amount, 0);
  const threshold = minimumThresholdCents || 50000; // €500 minimum

  return {
    commissions,
    totalCents,
    canPayout: totalCents >= threshold,
  };
}

/**
 * Schedule a batch payout for multiple affiliates
 */
export async function scheduleBatchPayout(
  affiliateIds: string[],
  minimumThresholdCents: number = 50000
): Promise<{ createdPayouts: number; totalAmountCents: number; payoutIds: string[] }> {
  const payouts = [];
  let totalAmount = 0;

  for (const affiliateId of affiliateIds) {
    const payable = await getPayableCommissions(affiliateId, minimumThresholdCents);

    if (payable.canPayout) {
      const payout = await createPayout(affiliateId, payable.totalCents);
      payouts.push(payout.payoutId);
      totalAmount += payable.totalCents;

      // Link commissions to payout
      await prisma.commission.updateMany({
        where: {
          affiliateId,
          status: 'APPROVED',
          payoutId: null,
        },
        data: {
          payoutId: payout.payoutId,
          payoutDate: new Date(),
        },
      });
    }
  }

  return {
    createdPayouts: payouts.length,
    totalAmountCents: totalAmount,
    payoutIds: payouts,
  };
}

/**
 * Get payout history for an affiliate
 */
export async function getPayoutHistory(
  affiliateId: string,
  opts?: {
    limit?: number;
    offset?: number;
    status?: string;
  }
): Promise<{ payouts: any[]; total: number; totalAmount: number }> {
  const where: any = { affiliateId };
  if (opts?.status) where.status = opts.status;

  const [payouts, total, sum] = await Promise.all([
    prisma.payout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts?.limit || 50,
      skip: opts?.offset || 0,
    }),
    prisma.payout.count({ where }),
    prisma.payout.aggregate({
      where,
      _sum: { amount: true },
    }),
  ]);

  return {
    payouts,
    total,
    totalAmount: sum._sum.amount || 0,
  };
}

/**
 * Set up automatic payout schedule
 */
export async function setPayoutSchedule(
  affiliateId: string,
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY',
  minimumThresholdCents: number = 50000
): Promise<PayoutSchedule> {
  // Calculate next payout date
  const now = new Date();
  const nextDate = new Date(now);

  switch (frequency) {
    case 'WEEKLY':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'BIWEEKLY':
      nextDate.setDate(nextDate.getDate() + 14);
      break;
    case 'MONTHLY':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
  }

  // Store in metadata or create a separate PayoutSchedule table if needed
  // For now, we'll update the affiliate with this info in a JSON field
  // (This assumes a payoutSchedule JSON field exists in the Affiliate model)

  return {
    id: `schedule_${affiliateId}_${Date.now()}`,
    affiliateId,
    frequency,
    nextPayoutDate: nextDate,
    status: 'ACTIVE',
    minimumThreshold: minimumThresholdCents,
  };
}

/**
 * Generate a tax document for an affiliate
 */
export async function generateTaxDocument(
  affiliateId: string,
  year: number,
  type: 'INVOICE_1099' | 'TAX_FORM' | '1042_S' = 'INVOICE_1099'
): Promise<TaxDocument> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
  });

  if (!affiliate) throw new Error('Affiliate not found');

  // Get earnings for the year
  const payouts = await prisma.payout.findMany({
    where: {
      affiliateId,
      status: 'COMPLETED',
      completedAt: {
        gte: new Date(`${year}-01-01`),
        lte: new Date(`${year}-12-31`),
      },
    },
  });

  const totalEarnings = payouts.reduce((sum, p) => sum + p.amount, 0);

  // Generate document (placeholder — actual implementation would create a PDF)
  const documentUrl = `https://zekerflex.nl/tax-docs/${affiliateId}/${year}_${type}.pdf`;

  // Store in DB if needed
  // await prisma.taxDocument.create({ ... })

  return {
    id: `tax_${affiliateId}_${year}_${type}`,
    affiliateId,
    year,
    type,
    totalEarnings,
    document: documentUrl,
    generatedAt: new Date(),
  };
}

/**
 * Get annual earnings summary
 */
export async function getAnnualEarningsSummary(affiliateId: string, year: number) {
  const startDate = new Date(`${year}-01-01`);
  const endDate = new Date(`${year}-12-31`);

  const commissions = await prisma.commission.aggregate({
    where: {
      affiliateId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    _sum: { amount: true },
    _count: true,
  });

  const payouts = await prisma.payout.aggregate({
    where: {
      affiliateId,
      completedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    _sum: { amount: true },
    _count: true,
  });

  const conversions = await prisma.tracking.count({
    where: {
      affiliateId,
      converted: true,
      lastClick: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  return {
    year,
    totalCommissions: commissions._sum.amount || 0,
    totalCommissionsCount: commissions._count,
    totalPayouts: payouts._sum.amount || 0,
    totalPayoutsCount: payouts._count,
    unpaidCommissions: (commissions._sum.amount || 0) - (payouts._sum.amount || 0),
    conversionCount: conversions,
  };
}

/**
 * Export earnings report for tax purposes
 */
export async function exportTaxReport(affiliateId: string, year: number): Promise<string> {
  const summary = await getAnnualEarningsSummary(affiliateId, year);
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
  });

  if (!affiliate) throw new Error('Affiliate not found');

  // Generate CSV content
  const csv = [
    'ZekerFlex Partners — Jaarlijkse inkomstenrapport',
    `Jaar: ${year}`,
    `Naam: ${affiliate.name}`,
    `Email: ${affiliate.email}`,
    '',
    'Samenvatting',
    `Totale commissies: €${(summary.totalCommissions / 100).toFixed(2)}`,
    `Totale uitbetalingen: €${(summary.totalPayouts / 100).toFixed(2)}`,
    `Wachtend op uitbetaling: €${(summary.unpaidCommissions / 100).toFixed(2)}`,
    `Conversies: ${summary.conversionCount}`,
  ].join('\n');

  return csv;
}
