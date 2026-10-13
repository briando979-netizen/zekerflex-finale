import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { decideOfferedClaim, getClaim } from "@/lib/claims/store";
import { issueClaimInvoice } from "@/lib/claims/billing";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { ensureDirectThread, postMessage } from "@/lib/messaging/store";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ decision: z.enum(["accepted", "declined"]) });

// POST /api/werkgever/claims/:id/decide-offer — employer accepts (exercises)
// or declines a system-offered claim against a freelancer who cancelled late
// or didn't show up.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    requireRole(p, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");

    await enforceRateLimit({
      name: "claim-decide-offer",
      identifier: p.userId,
      limit: 30,
      windowSeconds: 600,
      message: "Te veel pogingen — probeer het over enkele minuten opnieuw.",
    });

    const claim = await getClaim(params.id);
    if (!claim) throw AppError.notFound("Claim niet gevonden.");
    if (claim.direction !== "employer_owed") throw AppError.validation("Dit is geen aangeboden claim.");

    const scope = await resolveEmployerScope(p);
    if (!scope.tenantIds.includes(claim.employerTenantId)) {
      throw AppError.forbidden("Deze claim hoort niet bij jouw organisatie.");
    }

    const { decision } = schema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));

    const updated = await decideOfferedClaim(params.id, decision, p.userId);
    if (!updated) throw AppError.validation("Claim is al afgehandeld.");

    if (decision === "accepted") {
      await issueClaimInvoice(updated).catch((err) =>
        logger.warn("offered claim accepted but invoice issuance failed", { claimId: updated.id, error: (err as Error).message }),
      );
    }

    await recordAudit({
      category: "BILLING",
      action: `claim.offer_${decision}`,
      actorUserId: p.userId,
      actorLabel: "user",
      summary: `Aangeboden claim ${decision === "accepted" ? "geaccepteerd" : "geweigerd"} — "${claim.shiftTitle}" (${(
        claim.claimedCents / 100
      ).toFixed(2)})`,
      targetType: "shift",
      targetId: claim.shiftId,
    });

    try {
      const freelancer = await prisma.user.findUnique({ where: { id: claim.freelancerUserId }, select: { id: true } });
      if (freelancer) {
        const t = await ensureDirectThread(p.userId, freelancer.id, {
          contextKey: `shift:${claim.shiftId}`,
          shiftId: claim.shiftId,
          shiftTitle: claim.shiftTitle,
        });
        await postMessage(
          t.id,
          "system",
          decision === "accepted"
            ? `De opdrachtgever heeft een vergoeding van ${new Intl.NumberFormat("nl-NL", {
                style: "currency",
                currency: "EUR",
              }).format(claim.claimedCents / 100)} geclaimd wegens te laat afzeggen/niet opdagen. Je ontvangt hierover een factuur per mail.`
            : `De opdrachtgever heeft afgezien van het claimen van een vergoeding voor "${claim.shiftTitle}".`,
          "system",
        );
      }
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({ claim: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
