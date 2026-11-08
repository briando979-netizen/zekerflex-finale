import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AppError, toErrorBody } from '@/lib/errors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const eventSchema = z.object({
  events: z.array(
    z.object({
      eventName: z.string(),
      eventValue: z.number().optional(),
      properties: z.record(z.unknown()).optional(),
      timestamp: z.number(),
      sessionId: z.string(),
      appStartTime: z.number(),
    })
  ),
  sessionId: z.string(),
  appStartTime: z.number(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const payload = eventSchema.parse(body);

    // Batch insert analytics events
    for (const event of payload.events) {
      await prisma.analyticsEvent.create({
        data: {
          sessionId: payload.sessionId,
          eventName: event.eventName,
          eventValue: event.eventValue,
          properties: event.properties as Record<string, unknown>,
          timestamp: new Date(event.timestamp),
          appStartTime: new Date(payload.appStartTime),
        },
      });
    }

    return NextResponse.json(
      { success: true, processed: payload.events.length },
      { status: 201 }
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 100), 1000);

    if (!sessionId) {
      throw AppError.validation('sessionId required');
    }

    const events = await prisma.analyticsEvent.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return NextResponse.json({ events });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
