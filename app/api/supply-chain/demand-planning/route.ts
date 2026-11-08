import { NextRequest, NextResponse } from 'next/server';
import { forecastDemand, salesOperationsPlan, adjustDemandForecast, demandShaping } from '@/lib/supply-chain';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const productId = searchParams.get('productId');
    const horizonMonths = parseInt(searchParams.get('horizonMonths') || '12');

    if (action === 'forecast') {
      const forecast = await forecastDemand(horizonMonths);
      return NextResponse.json(forecast);
    }

    if (action === 'sop') {
      const plan = await salesOperationsPlan();
      return NextResponse.json(plan);
    }

    if (action === 'adjust' && productId) {
      const adjustments = JSON.parse(searchParams.get('adjustments') || '{}');
      const adjusted = await adjustDemandForecast(productId, adjustments);
      return NextResponse.json(adjusted);
    }

    if (action === 'shape' && productId) {
      const targetInventory = parseInt(searchParams.get('targetInventory') || '0');
      const shape = await demandShaping(productId, targetInventory);
      return NextResponse.json(shape);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
