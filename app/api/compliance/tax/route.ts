import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import {
  generateInvoice,
  generateTaxForm,
  getDeductionSummary
} from '@/lib/compliance/tax-documentation';
import { AppError, toErrorBody } from '@/lib/errors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const type = request.nextUrl.searchParams.get('type') || 'deductions';
    const year = parseInt(request.nextUrl.searchParams.get('year') || String(new Date().getFullYear()));

    if (type === 'deductions') {
      const summary = await getDeductionSummary(principal.userId, year);
      return NextResponse.json({ summary });
    }

    throw AppError.validation('Invalid type');
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { action } = z.object({ action: z.enum(['generate-invoice', 'generate-tax-form']) }).parse(body);

    if (action === 'generate-invoice') {
      const invoiceData = z.object({
        amount: z.number(),
        description: z.string(),
        invoiceDate: z.string().datetime(),
        dueDate: z.string().datetime(),
      }).parse(body);

      const invoice = await generateInvoice(principal.userId, {
        amount: invoiceData.amount,
        description: invoiceData.description,
        invoiceDate: new Date(invoiceData.invoiceDate),
        dueDate: new Date(invoiceData.dueDate),
      });

      return NextResponse.json({ invoice }, { status: 201 });
    }

    if (action === 'generate-tax-form') {
      const formData = z.object({
        year: z.number(),
      }).parse(body);

      const form = await generateTaxForm(principal.userId, formData.year);
      return NextResponse.json({ form }, { status: 201 });
    }

    throw AppError.validation('Invalid action');
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
