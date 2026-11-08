import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { requestInstantPayout, getPayoutHistory } from '@/lib/payout/instant';
import { calculateFees, recordFeeBreakdown } from '@/lib/payout/fees';
import { checkFraudRisk, logPaymentSecurity } from '@/lib/payout/security';
import { z } from 'zod';
import { toErrorBody } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const payoutRequestSchema = z.object({
  amount: z.number().positive(),
  bankAccountId: z.string(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const history = await getPayoutHistory(principal.userId);
    return NextResponse.json({ payouts: history });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { amount, bankAccountId } = payoutRequestSchema.parse(body);

    // Calculate fees
    const feeBreakdown = await calculateFees({
      grossAmount: amount,
      freelancerId: principal.userId,
    });

    // Check fraud risk
    const fraudScore = await checkFraudRisk({
      freelancerId: principal.userId,
      payoutAmount: amount,
      bankAccountId,
      ipAddress: request.ip || undefined,
    });

    // Create payout request
    const payout = await requestInstantPayout({
      freelancerId: principal.userId,
      amount: feeBreakdown.netAmount,
      bankAccountId,
    });

    // Record fee breakdown
    await recordFeeBreakdown(payout.id, feeBreakdown);

    // Log security check
    const approved = fraudScore.riskLevel !== 'HIGH';
    await logPaymentSecurity(payout.id, fraudScore, approved);

    if (!approved) {
      return NextResponse.json(
        { error: 'Payout request flagged for review', fraudScore },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { payout, feeBreakdown, fraudScore },
      { status: 201 }
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
