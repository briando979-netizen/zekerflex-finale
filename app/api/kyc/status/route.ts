import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { refreshKyc } from "@/lib/kyc/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/kyc/status[?refresh=1]
 * Returns the current freelancer's KYC state. `refresh=1` also pulls the latest
 * decision from Didit before responding (use sparingly - webhooks are primary).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const log = logger.child({ route: "GET /api/kyc/status" });
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: {
        id: true,
        user: { select: { kycStatus: true } },
        companyRegistrationId: true,
        kvkValid: true,
        vatValid: true,
      },
    });
    if (!profile) throw AppError.forbidden("No freelancer profile for this user");

    const latest = await prisma.identityVerification.findFirst({
      where: { userId: principal.userId, provider: "DIDIT" },
      orderBy: { createdAt: "desc" },
      select: {
        sessionId: true,
        sessionUrl: true,
        status: true,
        decisionStatus: true,
        verifiedAt: true,
        expiresAt: true,
        nfcChipVerified: true,
        livenessScore: true,
        faceMatchScore: true,
        lastWebhookAt: true,
      },
    });

    const wantsRefresh =
      new URL(request.url).searchParams.get("refresh") === "1";
    if (wantsRefresh && latest?.sessionId) {
      try {
        await refreshKyc(latest.sessionId);
      } catch (err) {
        log.warn("kyc refresh failed", { error: (err as Error).message });
      }
    }

    const fresh = await prisma.user.findUniqueOrThrow({
      where: { id: principal.userId },
      select: { kycStatus: true },
    });

    return NextResponse.json({
      kycStatus: fresh.kycStatus,
      kvkValid: profile.kvkValid,
      vatValid: profile.vatValid,
      companyRegistered: Boolean(profile.companyRegistrationId),
      session: latest,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("kyc status failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
