import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { decideClaim, getClaim } from "@/lib/claims/store";
import { recordAudit } from "@/lib/audit";
import { ensureDirectThread, postMessage } from "@/lib/messaging/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().max(500).optional() });

// POST /api/werkgever/claims/:id — employer approves or rejects a 50% claim.
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");

    const claim = await getClaim(params.id);
    if (!claim) throw AppError.notFound("Claim niet gevonden.");

    // verify the employer owns the branch the claim is about
    const scope = await resolveEmployerScope(p);
    const branch = await prisma.branch.findFirst({
      where: { name: claim.branchName, tenantId: { in: scope.tenantIds } },
      select: { id: true },
    });
    if (!branch && claim.employerUserId !== p.userId) {
      throw AppError.forbidden("Deze claim hoort niet bij jouw organisatie.");
    }

    const { decision, note } = schema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));

    const updated = await decideClaim(params.id, decision, p.userId, note);
    if (!updated) throw AppError.validation("Claim is al afgehandeld.");

    await recordAudit({
      category: "MATCHING",
      action: `claim.${decision}`,
      actorUserId: p.userId,
      actorLabel: "user",
      summary: `Annuleringsclaim ${decision === "approved" ? "goedgekeurd" : "afgewezen"} — "${claim.shiftTitle}" (${(
        claim.claimedCents / 100
      ).toFixed(2)})`,
      targetType: "shift",
      targetId: claim.shiftId,
    });

    try {
      const t = await ensureDirectThread(p.userId, claim.freelancerUserId, {
        contextKey: `shift:${claim.shiftId}`,
        shiftId: claim.shiftId,
        shiftTitle: claim.shiftTitle,
      });
      await postMessage(
        t.id,
        "system",
        decision === "approved"
          ? `Je annuleringsclaim is goedgekeurd. Je ontvangt ${new Intl.NumberFormat("nl-NL", {
              style: "currency",
              currency: "EUR",
            }).format(claim.claimedCents / 100)} bij je eerstvolgende uitbetaling.`
          : `Je annuleringsclaim is afgewezen.${note ? ` Toelichting: ${note}` : ""}`,
        "system",
      );
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({ claim: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
