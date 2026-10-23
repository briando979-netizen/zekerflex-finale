import { NextResponse } from "next/server";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toErrorBody, AppError } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getAgreementSeal, sealAgreement, verifyAgreementSeal } from "@/lib/agreements/esign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/overeenkomsten/<id>/zegel — waarmerk + verificatie van een modelovereenkomst.
// Alleen een partij bij de overeenkomst (de flexwerker of iemand van de opdrachtgever) of een admin.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { id } = await props.params;
    const ag = await prisma.modelAgreement.findUnique({ where: { id }, select: { tenantId: true, freelancer: { select: { userId: true } }, status: true } });
    if (!ag) throw AppError.notFound("Overeenkomst niet gevonden");
    const isAdmin = hasRole(p, "PLATFORM_ADMIN");
    const isFreelancer = ag.freelancer.userId === p.userId;
    const isEmployer = !isFreelancer && (await resolveEmployerScope(p)).tenantIds.includes(ag.tenantId);
    if (!isAdmin && !isFreelancer && !isEmployer) throw AppError.forbidden("Geen toegang tot deze overeenkomst");

    // seal on demand if it's active but was never sealed (e.g. signed before this feature)
    if (ag.status === "ACTIVE" && !(await getAgreementSeal(id))) await sealAgreement(id).catch(() => undefined);
    const [seal, verification] = await Promise.all([getAgreementSeal(id), verifyAgreementSeal(id)]);
    return NextResponse.json({ seal, verification });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
