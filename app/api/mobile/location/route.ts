import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number(),
  shiftId: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { latitude, longitude, accuracy, shiftId } = locationSchema.parse(body);

    if (shiftId) {
      await prisma.shiftLocation.create({
        data: {
          shiftId,
          userId: principal.userId,
          latitude,
          longitude,
          accuracy,
        },
      });
    }

    return NextResponse.json({ tracked: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to track location' }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const shiftId = request.nextUrl.searchParams.get('shiftId');

    if (!shiftId) {
      return NextResponse.json({ error: 'Shift ID required' }, { status: 400 });
    }

    const locations = await prisma.shiftLocation.findMany({
      where: { shiftId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ locations });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 });
  }
}
