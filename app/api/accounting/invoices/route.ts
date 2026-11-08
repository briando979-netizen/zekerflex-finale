import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { createInvoice, getInvoicesByTenant } from "@/lib/invoicing/manager";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const role = request.nextUrl.searchParams.get("role") as "issuer" | "recipient" || "issuer";

    const invoices = await getInvoicesByTenant(principal.tenantId, role);
    return NextResponse.json({ invoices });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const invoice = await createInvoice({
      ...body,
      issuerId: principal.tenantId,
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
