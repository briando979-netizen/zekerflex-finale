import { NextResponse } from "next/server";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { agreementPdf } from "@/lib/pdf/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/model-agreements/:id/pdf — the modelovereenkomst as a PDF.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const p = await requirePrincipal();
    const a = await prisma.modelAgreement.findUnique({
      where: { id: params.id },
      select: { tenantId: true, freelancer: { select: { userId: true } } },
    });
    if (!a) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Niet gevonden" } }, { status: 404 });

    const allowed =
      hasRole(p, "PLATFORM_ADMIN") ||
      a.freelancer.userId === p.userId ||
      (hasRole(p, "HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER") &&
        p.grants.some((g) => g.organizationId === a.tenantId));
    if (!allowed) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Geen toegang" } }, { status: 403 });
    }

    const doc = await agreementPdf(params.id);
    if (!doc) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Niet gevonden" } }, { status: 404 });
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
