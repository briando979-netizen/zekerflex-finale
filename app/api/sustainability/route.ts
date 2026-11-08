import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { generateESGReport } from '@/lib/sustainability/reporting';
import { getEnergyEfficiency } from '@/lib/sustainability/energy';
import { getWasteReduction } from '@/lib/sustainability/waste';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requirePrincipal();

    const year = new URL(request.url).searchParams.get('year');
    const report = await generateESGReport(parseInt(year || new Date().getFullYear().toString()));

    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePrincipal();

    const { startDate, endDate } = await request.json();
    const energy = await getEnergyEfficiency(new Date(startDate), new Date(endDate));
    const waste = await getWasteReduction(new Date(startDate), new Date(endDate));

    return NextResponse.json({ energy, waste });
  } catch (err) {
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}
