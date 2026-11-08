import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import {
  enrollInsurance,
  verifyInsuranceCoverage,
  fileClaim,
  getClaimStatus,
  checkCoverageForShift
} from '@/lib/compliance/insurance';
import { AppError, toErrorBody } from '@/lib/errors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const enrollSchema = z.object({
  coverageType: z.enum(['LIABILITY', 'ACCIDENT', 'HEALTH', 'INCOME_PROTECTION', 'PROFESSIONAL_INDEMNITY']),
  provider: z.string(),
  policyNumber: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  premiumMonthly: z.number(),
  coverageAmount: z.number(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const type = request.nextUrl.searchParams.get('type') || 'coverage';

    if (type === 'coverage') {
      const coverage = await verifyInsuranceCoverage(principal.userId);
      return NextResponse.json({ coverage });
    }

    if (type === 'claim') {
      const claimId = request.nextUrl.searchParams.get('claimId');
      if (!claimId) throw AppError.validation('Claim ID required');
      const claim = await getClaimStatus(claimId);
      return NextResponse.json({ claim });
    }

    throw AppError.validation('Invalid type');
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { action } = z.object({ action: z.enum(['enroll', 'file-claim', 'check-coverage']) }).parse(body);

    if (action === 'enroll') {
      const data = enrollSchema.parse(body);
      const insurance = await enrollInsurance({
        freelancerId: principal.userId,
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: 'PENDING',
      });
      return NextResponse.json({ insurance }, { status: 201 });
    }

    if (action === 'file-claim') {
      const claimData = z.object({
        insuranceId: z.string(),
        claimType: z.string(),
        description: z.string(),
        amount: z.number(),
        evidenceUrls: z.array(z.string()),
      }).parse(body);

      const claim = await fileClaim(claimData.insuranceId, {
        claimType: claimData.claimType,
        description: claimData.description,
        amount: claimData.amount,
        evidenceUrls: claimData.evidenceUrls,
      });

      return NextResponse.json({ claim }, { status: 201 });
    }

    if (action === 'check-coverage') {
      const checkData = z.object({
        shiftType: z.string(),
      }).parse(body);

      const hasCoverage = await checkCoverageForShift(principal.userId, checkData.shiftType);
      return NextResponse.json({ hasCoverage });
    }

    throw AppError.validation('Invalid action');
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
