import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { mayAccessInvoice } from "@/lib/billing/invoice-access";
import { invoicePdf } from "@/lib/pdf/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/invoices/:id/pdf — download an invoice as PDF.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    if (!(await mayAccessInvoice(p, params.id))) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Geen toegang tot deze factuur" } }, { status: 403 });
    }
    const doc = await invoicePdf(params.id);
    if (!doc) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Factuur niet gevonden" } }, { status: 404 });
    return new Response(new Uint8Array(doc.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.filename}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
