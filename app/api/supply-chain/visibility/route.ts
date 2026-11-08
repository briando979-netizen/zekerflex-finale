import { NextRequest, NextResponse } from 'next/server';
import { endToEndTracking, transparencyDashboard, setupAlerts, realTimeUpdates } from '@/lib/supply-chain';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const orderId = searchParams.get('orderId');

    if (action === 'track' && orderId) {
      const tracking = await endToEndTracking(orderId);
      return NextResponse.json(tracking);
    }

    if (action === 'dashboard') {
      const dashboard = await transparencyDashboard();
      return NextResponse.json(dashboard);
    }

    if (action === 'updates' && orderId) {
      const updates = await realTimeUpdates(orderId);
      return NextResponse.json(updates);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, alertTypes } = body;

    if (!orderId || !alertTypes) {
      return NextResponse.json({ error: 'orderId and alertTypes required' }, { status: 400 });
    }

    const alerts = await setupAlerts(orderId, alertTypes);
    return NextResponse.json(alerts);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
