import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { getPayoutAnalytics, getPayoutTrends } from '@/lib/payout/analytics';
import { toErrorBody } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const days = parseInt(request.nextUrl.searchParams.get('days') || '90');
    const trend = request.nextUrl.searchParams.get('trend') === 'true';

    if (trend) {
      const trends = await getPayoutTrends(principal.userId, 6);
      return NextResponse.json({ trends });
    }

    const analytics = await getPayoutAnalytics(principal.userId, days);
    return NextResponse.json({ analytics });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
