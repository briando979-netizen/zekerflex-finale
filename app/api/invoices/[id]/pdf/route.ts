import { NextResponse } from "next/server";
import { requirePrincipal, type Principal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { invoicePdf } from "@/lib/pdf/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function mayAccessInvoice(p: Principal, invoiceId: string): Promise<boolean> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { recipientTenantId: true, issuerFreelancerId: true },
  });
  if (!inv) return false;

  // freelancer who issued it
  if (inv.issuerFreelancerId) {
    const fp = await prisma.freelancerProfile.findFirst({
      where: { id: inv.issuerFreelancerId, userId: p.userId },
      select: { id: true },
    });
    if (fp) return true;
  }
  // employer of the recipient tenant
  const scope = await resolveEmployerScope(p).catch(() => null);
  if (scope?.tenantIds.includes(inv.recipientTenantId)) return true;

  return p.grants.some((g) => g.role === "PLATFORM_ADMIN");
}

// GET /api/invoices/:id/pdf — download an invoice as PDF.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
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
