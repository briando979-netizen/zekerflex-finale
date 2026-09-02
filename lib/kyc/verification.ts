import { KycStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import {
  createSession,
  getDecision,
  isDiditEnabled,
  mapDiditStatus,
  parseDecision,
  type DiditDecision,
} from "@/lib/integrations/didit";

// ---------------------------------------------------------------------------
// KYC verification workflow (Didit)
//
// startFreelancerKyc  -> creates a Didit session, stores an IdentityVerification
//                        row (status PENDING) and returns the hosted URL.
// applyDiditDecision  -> called by the webhook and the manual refresh; updates
//                        the IdentityVerification row and the user's kycStatus.
// refreshKyc          -> pulls the decision endpoint on demand.
//
// kycStatus VERIFIED is one of the gates the matching engine enforces.
// ---------------------------------------------------------------------------

export interface StartKycResult {
  sessionId: string;
  verificationUrl: string;
  status: KycStatus;
  alreadyVerified: boolean;
}

export async function startFreelancerKyc(
  freelancerProfileId: string,
): Promise<StartKycResult> {
  if (!isDiditEnabled()) {
    throw AppError.upstream("KYC verification is not configured");
  }

  const fp = await prisma.freelancerProfile.findUnique({
    where: { id: freelancerProfileId },
    select: { id: true, userId: true, user: { select: { email: true, kycStatus: true } } },
  });
  if (!fp) throw AppError.notFound("Freelancer profile not found");

  // Reuse an open session if one is still pending.
  const open = await prisma.identityVerification.findFirst({
    where: {
      userId: fp.userId,
      provider: "DIDIT",
      status: { in: [KycStatus.PENDING, KycStatus.NOT_STARTED] },
      sessionUrl: { not: null },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (open?.sessionId && open.sessionUrl) {
    return {
      sessionId: open.sessionId,
      verificationUrl: open.sessionUrl,
      status: open.status,
      alreadyVerified: fp.user.kycStatus === KycStatus.VERIFIED,
    };
  }

  const callbackUrl =
    env.DIDIT_CALLBACK_URL ?? `${env.APP_BASE_URL}/kyc/callback`;

  const session = await createSession({
    vendorData: fp.userId,
    callbackUrl,
    metadata: { freelancerProfileId: fp.id },
  });

  await prisma.identityVerification.create({
    data: {
      userId: fp.userId,
      provider: "DIDIT",
      sessionId: session.sessionId,
      sessionUrl: session.url,
      workflowId: env.DIDIT_WORKFLOW_ID ?? null,
      vendorData: fp.userId,
      decisionStatus: session.status,
      status: mapDiditStatus(session.status),
      rawPayload: session.raw as Prisma.InputJsonValue,
    },
  });

  if (fp.user.kycStatus === KycStatus.NOT_STARTED) {
    await prisma.user.update({
      where: { id: fp.userId },
      data: { kycStatus: KycStatus.PENDING },
    });
  }

  logger.info("kyc session started", {
    freelancerProfileId: fp.id,
    sessionId: session.sessionId,
  });

  return {
    sessionId: session.sessionId,
    verificationUrl: session.url,
    status: KycStatus.PENDING,
    alreadyVerified: fp.user.kycStatus === KycStatus.VERIFIED,
  };
}

/** Never downgrade a VERIFIED user except on an explicit reject / expiry. */
function reconcileUserKyc(current: KycStatus, incoming: KycStatus): KycStatus {
  if (current === KycStatus.VERIFIED) {
    return incoming === KycStatus.REJECTED || incoming === KycStatus.EXPIRED
      ? incoming
      : KycStatus.VERIFIED;
  }
  return incoming;
}

export interface ApplyDecisionInput {
  sessionId: string;
  decision: DiditDecision;
  via: "webhook" | "poll";
}

export interface ApplyDecisionResult {
  userId: string | null;
  kycStatus: KycStatus;
  matched: boolean;
}

export async function applyDiditDecision(
  input: ApplyDecisionInput,
): Promise<ApplyDecisionResult> {
  const { decision } = input;

  let record = await prisma.identityVerification.findUnique({
    where: { sessionId: input.sessionId },
    select: { id: true, userId: true },
  });

  // Webhook for a session we never stored (e.g. created out-of-band): fall back
  // to the vendor_data correlation id.
  if (!record && decision.vendorData) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: decision.vendorData }, { email: decision.vendorData }],
      },
      select: { id: true },
    });
    if (user) {
      const created = await prisma.identityVerification.create({
        data: {
          userId: user.id,
          provider: "DIDIT",
          sessionId: input.sessionId,
          vendorData: decision.vendorData,
          status: KycStatus.PENDING,
          rawPayload: {},
        },
        select: { id: true, userId: true },
      });
      record = created;
    }
  }

  if (!record) {
    logger.warn("didit decision for unknown session", {
      sessionId: input.sessionId,
    });
    return { userId: null, kycStatus: decision.kyc, matched: false };
  }
  const rec = record;

  const kycStatus = await prisma.$transaction(async (tx) => {
    await tx.identityVerification.update({
      where: { id: rec.id },
      data: {
        decisionStatus: decision.status,
        status: decision.kyc,
        documentType: decision.documentType,
        documentNumberHash: decision.documentNumberHash,
        nfcChipVerified: decision.nfcChipVerified,
        livenessScore: decision.livenessScore,
        faceMatchScore: decision.faceMatchScore,
        verifiedAt:
          decision.kyc === KycStatus.VERIFIED ? new Date() : null,
        expiresAt: decision.expiresAt ? new Date(decision.expiresAt) : null,
        rawPayload: decision.raw as Prisma.InputJsonValue,
        ...(input.via === "webhook" ? { lastWebhookAt: new Date() } : {}),
      },
    });

    const user = await tx.user.findUniqueOrThrow({
      where: { id: rec.userId },
      select: { kycStatus: true },
    });
    const next = reconcileUserKyc(user.kycStatus, decision.kyc);
    if (next !== user.kycStatus) {
      await tx.user.update({
        where: { id: rec.userId },
        data: { kycStatus: next },
      });
    }
    return next;
  });

  logger.info("kyc decision applied", {
    sessionId: input.sessionId,
    via: input.via,
    diditStatus: decision.status,
    kycStatus,
  });

  await recordAudit({
    category: "KYC",
    action: "kyc.decision",
    actorLabel: input.via === "webhook" ? "integration:didit" : "system",
    severity: kycStatus === KycStatus.REJECTED ? "warning" : "info",
    summary: `KYC-beslissing voor gebruiker ${rec.userId}: ${kycStatus} (Didit: ${decision.status})`,
    targetType: "user",
    targetId: rec.userId,
    metadata: {
      sessionId: input.sessionId,
      diditStatus: decision.status,
      via: input.via,
      kycStatus,
    },
  });

  return { userId: rec.userId, kycStatus, matched: true };
}

/** Pull the decision endpoint for a session and apply it. */
export async function refreshKyc(sessionId: string): Promise<ApplyDecisionResult> {
  const decision = await getDecision(sessionId);
  return applyDiditDecision({ sessionId, decision, via: "poll" });
}

/** Apply a raw webhook payload (already signature-verified by the caller). */
export async function applyWebhookPayload(
  payload: Record<string, unknown>,
): Promise<ApplyDecisionResult> {
  const sessionId = String(payload.session_id ?? "");
  if (!sessionId) {
    throw AppError.validation("Webhook payload missing session_id");
  }
  const decision = parseDecision(sessionId, payload);
  return applyDiditDecision({ sessionId, decision, via: "webhook" });
}
