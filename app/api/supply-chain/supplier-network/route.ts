import { NextRequest, NextResponse } from 'next/server';
import { rateSupplier, assessSupplierRisk, findAlternativeSuppliers } from '@/lib/supply-chain';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const supplierId = searchParams.get('supplierId');
    const productId = searchParams.get('productId');

    if (action === 'rate' && supplierId) {
      const rating = await rateSupplier(supplierId);
      return NextResponse.json(rating);
    }

    if (action === 'risk' && supplierId) {
      const risk = await assessSupplierRisk(supplierId);
      return NextResponse.json(risk);
    }

    if (action === 'alternatives' && productId && supplierId) {
      const alternatives = await findAlternativeSuppliers(productId, supplierId);
      return NextResponse.json(alternatives);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
