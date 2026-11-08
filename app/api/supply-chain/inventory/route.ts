import { NextRequest, NextResponse } from 'next/server';
import { optimizeInventory, forecastDemand } from '@/lib/supply-chain';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json({ error: 'productId required' }, { status: 400 });
    }

    const optimization = await optimizeInventory(productId);
    const forecast = await forecastDemand(productId, 12);

    return NextResponse.json({ optimization, forecast });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
