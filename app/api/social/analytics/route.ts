import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { getAggregateAnalytics, updateEngagementMetrics } from '@/lib/social/analytics';
import { z } from 'zod';

const analyticsSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') as any;

    if (platform) {
      await updateEngagementMetrics(principal.tenantId, platform);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update metrics' }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);

    const startDate = new Date(searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const endDate = new Date(searchParams.get('endDate') || new Date());

    const analytics = await getAggregateAnalytics(principal.tenantId, startDate, endDate);

    return NextResponse.json({ analytics });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 400 });
  }
}
