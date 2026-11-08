import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AppError, toErrorBody } from '@/lib/errors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const crashSchema = z.object({
  id: z.string(),
  message: z.string(),
  stack: z.string().optional(),
  context: z.record(z.unknown()).optional(),
  timestamp: z.number(),
  appVersion: z.string(),
  platform: z.enum(['ios', 'android', 'web']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  userId: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const crash = crashSchema.parse(body);

    const recorded = await prisma.crashReport.create({
      data: {
        externalId: crash.id,
        message: crash.message,
        stackTrace: crash.stack,
        context: crash.context,
        appVersion: crash.appVersion,
        platform: crash.platform,
        severity: crash.severity,
        userId: crash.userId,
        reportedAt: new Date(crash.timestamp),
      },
    });

    // Alert if critical
    if (crash.severity === 'critical') {
      await fetch('/api/internal/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'critical_crash',
          message: `Critical crash on ${crash.platform}: ${crash.message}`,
          context: crash.context,
        }),
      }).catch(() => {
        /* ignore */
      });
    }

    return NextResponse.json({ success: true, id: recorded.id }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const platform = request.nextUrl.searchParams.get('platform');
    const severity = request.nextUrl.searchParams.get('severity');
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 50), 500);

    const where: any = {};
    if (platform) where.platform = platform;
    if (severity) where.severity = severity;

    const crashes = await prisma.crashReport.findMany({
      where,
      orderBy: { reportedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ crashes });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
