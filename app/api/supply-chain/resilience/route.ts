import { NextRequest, NextResponse } from 'next/server';
import { disruptionRecovery, buildSupplierDiversity, contingencyPlans, riskMonitoring } from '@/lib/supply-chain';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const supplierId = searchParams.get('supplierId');
    const disruptionType = searchParams.get('disruptionType');

    if (action === 'recovery' && supplierId && disruptionType) {
      const recovery = await disruptionRecovery(supplierId, disruptionType);
      return NextResponse.json(recovery);
    }

    if (action === 'diversity') {
      const diversity = await buildSupplierDiversity();
      return NextResponse.json(diversity);
    }

    if (action === 'contingency') {
      const contingency = await contingencyPlans();
      return NextResponse.json(contingency);
    }

    if (action === 'risks') {
      const risks = await riskMonitoring();
      return NextResponse.json(risks);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
