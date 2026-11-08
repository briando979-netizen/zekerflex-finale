import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";
import {
  calculateProfileRisk,
  scoreAllProfiles,
} from "@/lib/fraud/profile-scoring";
import {
  analyzeWorkerBehavior,
} from "@/lib/fraud/behavior-analysis";
import {
  verifyIdentity,
  verifyAllIdentities,
} from "@/lib/fraud/identity-verification";
import {
  trackDispute,
  analyzeDisputeHistory,
  resolveDispute,
  flagSerialDisputers,
} from "@/lib/fraud/dispute-tracking";
import {
  evaluateAndMitigate,
  suspendAccount,
  issueWarning,
  enableMonitoring,
  unsuspendAccount,
  processMitigations,
} from "@/lib/fraud/risk-mitigation";

export const dynamic = "force-dynamic";

const disputeSchema = z.object({
  claimantId: z.string(),
  respondentId: z.string(),
  shiftId: z.string(),
  reason: z.string(),
});

const resolvDisputeSchema = z.object({
  outcome: z.enum(["CLAIMANT_WON", "RESPONDENT_WON"]),
});

const mitigationSchema = z.object({
  userId: z.string(),
  action: z.enum(["WARNING", "SUSPEND_TEMP", "SUSPEND_PERM", "INVESTIGATE", "MONITOR"]),
  reason: z.string(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");
    const userId = request.nextUrl.searchParams.get("userId");

    if (!userId) {
      throw AppError.validation("userId required");
    }

    const [profileRisk, identityVerification, disputeAnalysis, behavior] = await Promise.all([
      calculateProfileRisk(userId),
      verifyIdentity(userId),
      analyzeDisputeHistory(userId),
      analyzeWorkerBehavior(userId),
    ]);

    return NextResponse.json({
      userId,
      profileRisk,
      identityVerification,
      disputeAnalysis,
      behaviorAnomalies: behavior,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");
    const action = request.nextUrl.searchParams.get("action");

    switch (action) {
      case "score-all":
        await scoreAllProfiles();
        return NextResponse.json({ message: "All profiles scored" });

      case "verify-all":
        await verifyAllIdentities();
        return NextResponse.json({ message: "All identities verified" });

      case "analyze-all":
        const users = await prisma.user.findMany({ where: { role: "FREELANCER" } });
        for (const user of users) {
          await analyzeWorkerBehavior(user.id);
        }
        return NextResponse.json({ message: "All worker behaviors analyzed" });

      case "flag-disputers":
        const flagged = await flagSerialDisputers();
        return NextResponse.json({ flaggedUsers: flagged, count: flagged.length });

      case "process-mitigations":
        await processMitigations();
        return NextResponse.json({ message: "Mitigations processed" });

      case "dispute":
        const disputeBody = await request.json();
        const dispute = disputeSchema.parse(disputeBody);
        await trackDispute(dispute.claimantId, dispute.respondentId, dispute.shiftId, dispute.reason);
        return NextResponse.json({ message: "Dispute tracked" }, { status: 201 });

      default:
        throw AppError.validation("Invalid action");
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");
    const action = request.nextUrl.searchParams.get("action");

    const body = await request.json();

    switch (action) {
      case "resolve-dispute":
        const disputeId = request.nextUrl.searchParams.get("disputeId");
        if (!disputeId) throw AppError.validation("disputeId required");
        const resolution = resolvDisputeSchema.parse(body);
        await resolveDispute(disputeId, resolution.outcome);
        return NextResponse.json({ message: "Dispute resolved" });

      case "evaluate":
        const mitBody = mitigationSchema.parse(body);
        await evaluateAndMitigate(mitBody.userId);
        return NextResponse.json({ message: "Evaluation and mitigation applied" });

      case "suspend":
        const { userId, reason, permanent } = z.object({
          userId: z.string(),
          reason: z.string(),
          permanent: z.boolean().optional(),
        }).parse(body);
        await suspendAccount(userId, reason, permanent ?? false);
        return NextResponse.json({ message: "Account suspended" });

      case "unsuspend":
        const { userId: uId } = z.object({ userId: z.string() }).parse(body);
        await unsuspendAccount(uId);
        return NextResponse.json({ message: "Account unsuspended" });

      case "warn":
        const { userId: wId, reason: wReason } = z.object({
          userId: z.string(),
          reason: z.string(),
        }).parse(body);
        await issueWarning(wId, wReason);
        return NextResponse.json({ message: "Warning issued" });

      case "monitor":
        const { userId: mId, reason: mReason } = z.object({
          userId: z.string(),
          reason: z.string(),
        }).parse(body);
        await enableMonitoring(mId, mReason);
        return NextResponse.json({ message: "Monitoring enabled" });

      default:
        throw AppError.validation("Invalid action");
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
