import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, hasRole, assertOrganizationAccess } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  registerFreelancerCompany,
  registerTenantCompany,
} from "@/lib/company/registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kvkNumber: z.string().regex(/^\d[\d\s.]{6,11}$/),
  target: z.enum(["freelancer", "organization"]).default("freelancer"),
  organizationId: z.string().min(1).max(128).optional(),
});

/**
 * POST /api/company/register
 *
 *  { kvkNumber, target: "freelancer" }                         -> the caller's own profile
 *  { kvkNumber, target: "organization", organizationId: "…" }  -> an org (HQ_ADMIN/PLATFORM_ADMIN)
 *
 * Fetches + validates the company via KVKBase, snapshots it and flips the
 * relevant validity gate.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/company/register" });
  try {
    const principal = await requirePrincipal();
    const json = await request.json().catch(() => {
      throw AppError.validation("Body must be valid JSON");
    });
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw AppError.validation("Invalid request body", parsed.error.flatten());
    }
    const { kvkNumber, target } = parsed.data;

    if (target === "organization") {
      const organizationId = parsed.data.organizationId;
      if (!organizationId) {
        throw AppError.validation("organizationId is required for target=organization");
      }
      if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) {
        throw AppError.forbidden("Requires HQ_ADMIN or PLATFORM_ADMIN");
      }
      assertOrganizationAccess(principal, organizationId);
      const result = await registerTenantCompany({ tenantId: organizationId, kvkNumber });
      return NextResponse.json(result);
    }

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    if (!profile) throw AppError.forbidden("No freelancer profile for this user");

    const result = await registerFreelancerCompany({
      freelancerProfileId: profile.id,
      kvkNumber,
    });
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("registration failed", { error: (err as Error).message });
    else log.warn("registration rejected", { status, code: body.error.code });
    return NextResponse.json(body, { status });
  }
}
