import { NextRequest, NextResponse } from 'next/server';
import { optimizeRouting, trackShipment } from '@/lib/supply-chain';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const shipmentId = searchParams.get('shipmentId');
    const trackingNumber = searchParams.get('trackingNumber');

    if (action === 'track' && trackingNumber) {
      const shipment = await trackShipment(trackingNumber);
      return NextResponse.json(shipment);
    }

    if (action === 'optimize' && shipmentId) {
      const stops = JSON.parse(searchParams.get('stops') || '[]');
      const routing = await optimizeRouting(shipmentId, stops);
      return NextResponse.json(routing);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
