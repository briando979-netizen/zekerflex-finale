import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import {
  generatePL,
  generateCashFlow,
  generateVarianceReport,
  forecastFinancials,
} from '@/lib/reporting/financial';
import { getBudgetHealth, predictFutureBudgets, identifyCostOptimization } from '@/lib/finance/analytics';
import { AppError, toErrorBody } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole('PLATFORM_ADMIN');
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'pl') {
      const startDate = new Date(searchParams.get('start') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const endDate = new Date(searchParams.get('end') || new Date());
      const pl = await generatePL(startDate, endDate);
      return NextResponse.json(pl);
    }

    if (action === 'cash-flow') {
      const months = parseInt(searchParams.get('months') || '12');
      const cf = await generateCashFlow(months);
      return NextResponse.json(cf);
    }

    if (action === 'variance') {
      const budgetId = searchParams.get('budgetId');
      if (!budgetId) throw AppError.validation('budgetId required');
      const variance = await generateVarianceReport(budgetId);
      return NextResponse.json(variance);
    }

    if (action === 'forecast') {
      const months = parseInt(searchParams.get('months') || '3');
      const forecast = await forecastFinancials(months);
      return NextResponse.json(forecast);
    }

    if (action === 'health') {
      const health = await getBudgetHealth();
      return NextResponse.json(health);
    }

    if (action === 'optimize') {
      const optimization = await identifyCostOptimization();
      return NextResponse.json(optimization);
    }

    if (action === 'predict') {
      const months = parseInt(searchParams.get('months') || '3');
      const prediction = await predictFutureBudgets(months);
      return NextResponse.json(prediction);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
