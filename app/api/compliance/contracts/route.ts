import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { createContract, getContractsByFreelancer, signContract, validateContractTerms } from '@/lib/compliance/contracts';
import { AppError, toErrorBody } from '@/lib/errors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createContractSchema = z.object({
  shiftId: z.string(),
  contractType: z.enum(['SHIFT_AGREEMENT', 'MASTER_SERVICE', 'NDA', 'CONFIDENTIALITY']),
  terms: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  hourlyRate: z.number().positive(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const contracts = await getContractsByFreelancer(principal.userId);
    return NextResponse.json({ contracts });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const validated = createContractSchema.parse(body);

    const contract = await createContract({
      freelancerId: principal.userId,
      shiftId: validated.shiftId,
      contractType: validated.contractType,
      terms: validated.terms,
      startDate: new Date(validated.startDate),
      endDate: validated.endDate ? new Date(validated.endDate) : undefined,
      hourlyRate: validated.hourlyRate,
      status: 'DRAFT',
    });

    return NextResponse.json({ contract }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const contractId = request.nextUrl.searchParams.get('id');
    if (!contractId) throw AppError.validation('Contract ID required');

    const body = await request.json();
    const { action } = z.object({ action: z.enum(['sign', 'validate']) }).parse(body);

    if (action === 'sign') {
      const signData = z.object({
        signature: z.string(),
        signedAt: z.string().datetime(),
        ipAddress: z.string(),
      }).parse(body);

      const signed = await signContract(contractId, {
        freelancerSignature: signData.signature,
        signedAt: new Date(signData.signedAt),
        ipAddress: signData.ipAddress,
      });

      return NextResponse.json({ contract: signed });
    }

    if (action === 'validate') {
      const validation = await validateContractTerms(contractId);
      return NextResponse.json({ validation });
    }

    throw AppError.validation('Invalid action');
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
