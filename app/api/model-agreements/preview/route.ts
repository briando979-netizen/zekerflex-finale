import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { previewAgreementPdf } from "@/lib/pdf/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/model-agreements/preview?shiftId=<id> — the modelovereenkomst a
// freelancer would be asked to sign, before one actually exists (that's
// only provisioned once they're selected for the shift). Lets "Ik ga
// akkoord met de overeenkomst" in the reageer flow link to something real
// instead of nothing, for the common case of a first-time client.
export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    const shiftId = new URL(request.url).searchParams.get("shiftId");
    if (!shiftId) throw AppError.validation("shiftId ontbreekt");

    const doc = await previewAgreementPdf(shiftId, principal.userId);
    if (!doc) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Niet gevonden" } }, { status: 404 });
    }
    return new Response(new Uint8Array(doc.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
