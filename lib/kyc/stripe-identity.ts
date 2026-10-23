import { KycStatus } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { getStripeClient } from "@/lib/billing/stripe";
import { nameSimilarity } from "@/lib/onboarding/verify";
import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// ID verification via Stripe Identity: Stripe's own camera flow on the phone
// (document front/back + live selfie, with document-authenticity and face-
// match checks). On by default whenever Stripe is connected (opt out with
// STRIPE_IDENTITY_ENABLED=false). The result arrives by webhook AND is pulled
// from Stripe when the freelancer comes back to the verification page, so it
// also works before the identity.* webhook events are configured. If Stripe
// refuses (Identity not activated on the account) the option hides itself for
// a few hours and the built-in photo upload stays the route.
// ---------------------------------------------------------------------------

export const PROVIDER = "STRIPE_IDENTITY";
const UNAVAILABLE_KEY = "stripe-identity:unavailable-until";
const UNAVAILABLE_MS = 6 * 60 * 60 * 1000;

export function stripeIdentityEnabled(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY) && process.env.STRIPE_IDENTITY_ENABLED !== "false";
}

/** Enabled AND not recently refused by Stripe — decides whether the option is shown. */
export async function stripeIdentityAvailable(): Promise<boolean> {
  if (!stripeIdentityEnabled()) return false;
  const until = await kvGet<string>(UNAVAILABLE_KEY).catch(() => null);
  return !until || new Date(until).getTime() < Date.now();
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
    // e.g. Identity not activated on this Stripe account: stop offering it for a while
    await kvSet(UNAVAILABLE_KEY, new Date(Date.now() + UNAVAILABLE_MS).toISOString()).catch(() => undefined);
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
  const outcome = event.type.slice("identity.verification_session.".length);
  await applySession(event.data.object as Stripe.Identity.VerificationSession, outcome);
}

/**
 * Pull the result straight from Stripe for this user's open attempt — called
 * when they land back on the verification page, so nobody waits on a webhook.
 */
export async function syncStripeIdentity(userId: string): Promise<void> {
  if (!stripeIdentityEnabled()) return;
  const row = await prisma.identityVerification.findFirst({
    where: { userId, provider: PROVIDER, decisionStatus: { in: ["started", "processing"] } },
    orderBy: { createdAt: "desc" },
    select: { sessionId: true },
  });
  if (!row?.sessionId) return;
  try {
    const s = await getStripeClient().identity.verificationSessions.retrieve(row.sessionId);
    if (s.status === "verified" || s.status === "requires_input" || s.status === "canceled") await applySession(s, s.status);
    else if (s.status === "processing") {
      await prisma.identityVerification.updateMany({ where: { sessionId: s.id, decisionStatus: "started" }, data: { decisionStatus: "processing" } });
    }
  } catch (err) {
    logger.warn("stripe identity sync failed", { error: (err as Error).message });
  }
}

async function applySession(s: Stripe.Identity.VerificationSession, outcome: string): Promise<void> {
  const row = await prisma.identityVerification.findUnique({ where: { sessionId: s.id } });
  if (!row) {
    logger.warn("stripe identity event for unknown session", { session: s.id, outcome });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { id: true, fullName: true, kycStatus: true } });
  if (!user) return;

  // already decided (webhook and page sync can both arrive) — don't apply twice
  if (row.decisionStatus === "verified" || row.decisionStatus === "name_mismatch") return;

  if (outcome === "verified") {
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
    if (status === KycStatus.VERIFIED) {
      void import("@/lib/analytics/funnel").then(({ recordFunnel }) => recordFunnel("onboarding-werknemer", "verificatie-klaar")).catch(() => undefined);
    }
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

  if (outcome === "requires_input" || outcome === "canceled") {
    if (outcome === "requires_input" && !s.last_error) return; // just created, not yet attempted
    const reason = s.last_error?.reason ?? s.last_error?.code ?? (outcome === "canceled" ? "geannuleerd" : "niet afgerond");
    await prisma.identityVerification.update({ where: { id: row.id }, data: { decisionStatus: outcome === "canceled" ? "canceled" : "requires_input", rawPayload: { provider: PROVIDER, sessionId: s.id, reason } } });
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
