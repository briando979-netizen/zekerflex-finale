import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AppError, toErrorBody } from '@/lib/errors';
import * as SEOMonitoring from '@/lib/seo/monitoring';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const monitoringSchema = z.object({
  keywords: z.array(z.string()).min(1),
  trackingId: z.string().optional(),
});

const competitorSchema = z.object({
  competitors: z.array(z.string()).min(1),
  trackingId: z.string(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole('PLATFORM_ADMIN');

    const domain = request.nextUrl.searchParams.get('domain');
    const period = request.nextUrl.searchParams.get('period') || 'monthly';

    if (!domain) {
      throw AppError.validation('domain required');
    }

    const tracking = await SEOMonitoring.trackKeywordRanks(['seo', 'marketing', 'optimization']);
    const report = SEOMonitoring.generateSEOReport(
      {
        domain,
        trackingData: tracking,
        totalTraffic: 50000,
        visibilityScore: 75,
        updateFrequency: 'daily',
      },
      period as 'monthly' | 'quarterly' | 'annual'
    );

    return NextResponse.json({ report });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const body = await request.json();
    const { keywords } = monitoringSchema.parse(body);

    const tracking = await SEOMonitoring.trackKeywordRanks(keywords);
    const alerts = SEOMonitoring.monitoringAlerts(tracking);

    return NextResponse.json({ tracking, alerts }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole('PLATFORM_ADMIN');

    const body = await request.json();
    const { competitors, trackingId } = competitorSchema.parse(body);

    const competitorData = await SEOMonitoring.trackCompetitors('zekerflex.com', competitors);

    return NextResponse.json({ competitors: competitorData });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
