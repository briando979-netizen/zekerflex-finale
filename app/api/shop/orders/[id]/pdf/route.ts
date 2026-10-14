import { NextResponse } from "next/server";
import { shopOrderReceiptPdf } from "@/lib/pdf/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/shop/orders/:id/pdf — download a shop order receipt as PDF.
// No auth: /shop checkout is guest-only (no account), so there's no
// principal to gate on — the unguessable cuid order id is what scopes this,
// exactly like app/shop/bestelling/[id]/page.tsx.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await props.params;
  const doc = await shopOrderReceiptPdf(params.id);
  if (!doc) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Bestelling niet gevonden" } }, { status: 404 });
  return new Response(new Uint8Array(doc.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.filename}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
