import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requirePrincipal,
  hasRole,
  assertOrganizationAccess,
} from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { signModelAgreement } from "@/lib/agreements/model-agreement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().min(1).max(128) });

/**
 * POST /api/model-agreements/:id/sign
 *
 * The freelancer signs their own agreement; an HQ_ADMIN / LOCAL_MANAGER of the
 * client organization signs on the client's behalf. The signing party is
 * derived from the caller's role, not the request body.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/model-agreements/[id]/sign" });
  try {
    const principal = await requirePrincipal();
    const { id } = paramsSchema.parse(params);

    const agreement = await prisma.modelAgreement.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        freelancer: { select: { userId: true } },
      },
    });
    if (!agreement) throw AppError.notFound("Model agreement not found");

    let party: "FREELANCER" | "CLIENT";
    if (agreement.freelancer.userId === principal.userId) {
      party = "FREELANCER";
    } else if (hasRole(principal, "HQ_ADMIN", "LOCAL_MANAGER", "PLATFORM_ADMIN")) {
      assertOrganizationAccess(principal, agreement.tenantId);
      party = "CLIENT";
    } else {
      throw AppError.forbidden("Not a party to this model agreement");
    }

    const result = await signModelAgreement(id, party, principal.userId);
    return NextResponse.json({ ...result, signedAs: party });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("sign failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
