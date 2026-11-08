import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { createInvoice, publishInvoice, recordPayment, getClientRevenue } from "@/lib/billing/engine";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateInvoiceSchema = z.object({
  clientId: z.string(),
  hours: z.number().positive(),
  amount: z.number().positive(),
  invoiceDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  description: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const data = CreateInvoiceSchema.parse(body);

    const invoice = await createInvoice({
      clientId: data.clientId,
      userId: principal.userId,
      hours: data.hours,
      amount: data.amount,
      invoiceDate: new Date(data.invoiceDate),
      dueDate: new Date(data.dueDate),
      description: data.description,
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const invoiceId = request.nextUrl.searchParams.get("id");
    const action = request.nextUrl.searchParams.get("action");

    if (!invoiceId) throw AppError.validation("Invoice ID required");

    if (action === "publish") {
      const invoice = await publishInvoice(invoiceId);
      return NextResponse.json({ invoice });
    } else if (action === "pay") {
      const body = await request.json();
      const { amount } = z.object({ amount: z.number().positive() }).parse(body);
      const invoice = await recordPayment(invoiceId, amount);
      return NextResponse.json({ invoice });
    }

    throw AppError.validation("Invalid action");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
