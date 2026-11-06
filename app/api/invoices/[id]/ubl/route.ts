import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { mayAccessInvoice } from "@/lib/billing/invoice-access";
import { efactuurDocument } from "@/lib/efactuur/factuur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/invoices/:id/ubl — de factuur als UBL-e-factuur (XML) om in te lezen
// in een boekhoudpakket. ?controle=1 geeft de bedrijfsregel-controle als JSON.
export async function GET(req: Request, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await props.params;
  try {
    const p = await requirePrincipal();
    if (!(await mayAccessInvoice(p, id))) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Geen toegang tot deze factuur" } }, { status: 403 });
    }
    const doc = await efactuurDocument(id);
    if (!doc) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Factuur niet gevonden of zonder zakelijke ontvanger" } }, { status: 404 });
    if (new URL(req.url).searchParams.get("controle")) {
      return NextResponse.json({ nummer: doc.nummer, fouten: doc.fouten, peppolKlaar: doc.peppolKlaar, koperPeppolId: doc.koperPeppolId, koperEmail: doc.koperEmail });
    }
    return new Response(doc.xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${doc.bestandsnaam}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
