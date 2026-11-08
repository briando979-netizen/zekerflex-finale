import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import * as developersLib from '@/lib/marketplace/developers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();

    const stats = await developersLib.getDeveloperStats(principal.tenantId);

    if (!stats) {
      return NextResponse.json({ error: 'Developer not found' }, { status: 404 });
    }

    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
