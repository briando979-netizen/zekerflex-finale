import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { measurePerformance, optimizeForBattery, optimizeForSpeed } from '@/lib/mobile/performance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const metrics = await measurePerformance();
    return NextResponse.json({ metrics });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to measure performance' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const body = await request.json();
    const { mode } = body;

    if (mode === 'battery') {
      const strategy = await optimizeForBattery();
      return NextResponse.json({ strategy });
    }

    if (mode === 'speed') {
      const strategy = await optimizeForSpeed();
      return NextResponse.json({ strategy });
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to optimize performance' }, { status: 500 });
  }
}
