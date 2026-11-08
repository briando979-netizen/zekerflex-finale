import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getContractMetrics } from '@/lib/contracts/analytics';
import { toErrorBody } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    await requireRole('PLATFORM_ADMIN');
    const metrics = await getContractMetrics();
    return NextResponse.json({ metrics });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
