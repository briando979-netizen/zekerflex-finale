import { KycStatus } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { getStripeClient } from "@/lib/billing/stripe";
import { nameSimilarity } from "@/lib/onboarding/verify";

// ---------------------------------------------------------------------------
// ID verification via Stripe Identity: Stripe's own camera flow on the phone
// (document front/back + live selfie, with document-authenticity and face-
// match checks). The result comes back by webhook. Switched on by the owner
// with STRIPE_IDENTITY_ENABLED=true once Identity is activated on the Stripe
// account — until then the built-in photo upload stays the route.
// ---------------------------------------------------------------------------

export const PROVIDER = "STRIPE_IDENTITY";

export function stripeIdentityEnabled(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY) && process.env.STRIPE_IDENTITY_ENABLED === "true";
}

/** Start a Stripe-hosted verification; returns the URL to send the freelancer to. */
export async function startStripeIdentity(userId: string, email: string): Promise<string> {
  if (!stripeIdentityEnabled()) throw AppError.validation("Verifiëren via Stripe staat nog niet aan.");
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  let session: Stripe.Identity.VerificationSession;
  try {
    session = await getStripeClient().identity.verificationSessions.create({
      type: "document",
      options: { document: { require_matching_selfie: true, require_live_capture: true, allowed_types: ["id_card", "passport", "driving_license"] } },
      provided_details: { email },
      metadata: { userId },
      return_url: `${base}/dashboard/verificatie?identity=terug`,
    });
  } catch (err) {
    logger.error("stripe identity session failed", { error: (err as Error).message });
    throw AppError.upstream("Verifiëren via Stripe lukt nu niet. Kies 'Zelf foto's uploaden' of probeer het later opnieuw.");
  }
  await prisma.identityVerification.create({
    data: { userId, provider: PROVIDER, sessionId: session.id, vendorData: userId, decisionStatus: "started", status: KycStatus.PENDING },
  });
  await prisma.user.update({ where: { id: userId }, data: { kycStatus: KycStatus.PENDING } });
  if (!session.url) throw AppError.upstream("Stripe gaf geen verificatielink terug.");
  return session.url;
}

/** Webhook: identity.verification_session.* → update the attempt and the account. */
export async function handleStripeIdentityEvent(event: Stripe.Event): Promise<void> {
  if (!event.type.startsWith("identity.verification_session.")) return;
  const s = event.data.object as Stripe.Identity.VerificationSession;
  const row = await prisma.identityVerification.findUnique({ where: { sessionId: s.id } });
  if (!row) {
    logger.warn("stripe identity event for unknown session", { session: s.id, type: event.type });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { id: true, fullName: true, kycStatus: true } });
  if (!user) return;

  if (event.type === "identity.verification_session.verified") {
    // Name on the document must match the account (same rule as the built-in check).
    let docName: string | null = null;
    let docType: string | null = null;
    let expiresAt: Date | null = null;
    try {
      const full = await getStripeClient().identity.verificationSessions.retrieve(s.id, { expand: ["verified_outputs", "last_verification_report"] });
      const o = full.verified_outputs;
      docName = [o?.first_name, o?.last_name].filter(Boolean).join(" ") || null;
      const rep = full.last_verification_report as Stripe.Identity.VerificationReport | null;
      docType = rep?.document?.type ?? null;
      const exp = rep?.document?.expiration_date;
      if (exp?.year && exp.month && exp.day) expiresAt = new Date(Date.UTC(exp.year, exp.month - 1, exp.day));
    } catch (err) {
      logger.warn("stripe identity outputs not readable", { session: s.id, error: (err as Error).message });
    }
    const nameOk = docName ? nameSimilarity(user.fullName, docName) >= 0.5 : false;
    const status = nameOk ? KycStatus.VERIFIED : KycStatus.PENDING;
    await prisma.identityVerification.update({
      where: { id: row.id },
      data: {
        decisionStatus: nameOk ? "verified" : "name_mismatch",
        status,
        verifiedAt: nameOk ? new Date() : null,
        documentType: docType === "passport" ? "PASSPORT" : docType === "driving_license" ? "DRIVERS_LICENSE" : docType ? "ID_CARD" : null,
        expiresAt,
        rawPayload: { provider: PROVIDER, sessionId: s.id, nameOnDocument: docName, nameOk },
      },
    });
    if (user.kycStatus !== KycStatus.REJECTED) await prisma.user.update({ where: { id: user.id }, data: { kycStatus: status } });
    await recordAudit({
      category: "KYC",
      action: nameOk ? "kyc.stripe_verified" : "kyc.stripe_name_mismatch",
      actorLabel: "system:stripe-identity",
      severity: nameOk ? "info" : "warning",
      summary: nameOk ? `${user.fullName} geverifieerd via Stripe Identity` : `${user.fullName}: Stripe Identity geslaagd, maar naam op document (${docName ?? "onbekend"}) wijkt af — handmatige controle`,
      targetType: "user",
      targetId: user.id,
    });
    return;
  }

  if (event.type === "identity.verification_session.requires_input" || event.type === "identity.verification_session.canceled") {
    const reason = s.last_error?.reason ?? s.last_error?.code ?? (event.type.endsWith("canceled") ? "geannuleerd" : "niet afgerond");
    await prisma.identityVerification.update({ where: { id: row.id }, data: { decisionStatus: event.type.endsWith("canceled") ? "canceled" : "requires_input", rawPayload: { provider: PROVIDER, sessionId: s.id, reason } } });
    await recordAudit({ category: "KYC", action: "kyc.stripe_requires_input", actorLabel: "system:stripe-identity", summary: `${user.fullName}: Stripe-verificatie niet gelukt (${reason})`, targetType: "user", targetId: user.id });
  }
}

/** Latest Stripe attempt for the verification page ("bezig", "lukte niet: …"). */
export async function latestStripeIdentity(userId: string): Promise<{ status: string; reason: string | null; at: Date } | null> {
  const row = await prisma.identityVerification.findFirst({ where: { userId, provider: PROVIDER }, orderBy: { createdAt: "desc" }, select: { decisionStatus: true, rawPayload: true, createdAt: true } });
  if (!row) return null;
  const reason = (row.rawPayload as { reason?: string } | null)?.reason ?? null;
  return { status: row.decisionStatus ?? "started", reason, at: row.createdAt };
}
