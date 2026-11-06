import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { mayAccessInvoice, mayManageInvoiceDelivery } from "@/lib/billing/invoice-access";
import { efactuurStand, verstuurEfactuur } from "@/lib/efactuur/bezorging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/invoices/:id/efactuur — de bezorgstand van de e-factuur.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
  try {
    const p = await requirePrincipal();
    if (!(await mayAccessInvoice(p, id))) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Geen toegang tot deze factuur" } }, { status: 403 });
    }
    return NextResponse.json({ stand: await efactuurStand(id) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/invoices/:id/efactuur — (opnieuw) versturen via Peppol of mail.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
  try {
    const p = await requirePrincipal();
    if (!(await mayManageInvoiceDelivery(p, id))) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Alleen een beheerder van het bedrijf kan een e-factuur versturen" } }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as { opnieuw?: unknown };
    const stand = await verstuurEfactuur(id, { door: p.userId, opnieuw: body.opnieuw === true });
    return NextResponse.json({ stand });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
