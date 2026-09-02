import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { startFreelancerKyc } from "@/lib/kyc/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/kyc/start
 * Starts (or resumes) the current freelancer's Didit verification session and
 * returns the hosted verification URL to redirect them to.
 */
export async function POST(): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/kyc/start" });
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    if (!profile) throw AppError.forbidden("No freelancer profile for this user");

    const result = await startFreelancerKyc(profile.id);
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("kyc start failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
