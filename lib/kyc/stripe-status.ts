import type { AuthDict } from "@/lib/i18n/auth";

// ---------------------------------------------------------------------------
// Status of the last ID check on /dashboard/verificatie — pure, so the page
// and the tests share it. Back from Stripe the check is often still
// "processing" (Stripe needs a few seconds to a minute): the page then reloads
// itself (StripeIdentityWacht) instead of showing the bare "PENDING" and the
// whole form again, which made workers think it failed and start over.
// ---------------------------------------------------------------------------

type AttemptTexts = AuthDict["page"]["attempt"];

const DECISION_KEYS = ["started", "processing", "requires_input", "canceled", "name_mismatch", "verified", "in_review", "rejected"] as const;
type DecisionKey = (typeof DECISION_KEYS)[number];

const BY_STATUS: Record<string, keyof AttemptTexts> = {
  VERIFIED: "verified",
  REJECTED: "rejected",
  EXPIRED: "expired",
};

/** Label for the "Vorige poging" pill; never the raw enum (a manual decision stores free text). */
export function attemptLabel(t: AttemptTexts, decisionStatus: string | null, status: string): string {
  const d = decisionStatus ?? "";
  if ((DECISION_KEYS as readonly string[]).includes(d)) return t[d as DecisionKey];
  return t[BY_STATUS[status] ?? "in_review"];
}

/** Stripe has the photos and is still checking: keep asking until the outcome is in. */
export function waitForStripe(decisionStatus: string | null): boolean {
  return decisionStatus === "processing";
}

/** Reload every 5 s, at most 3 minutes; after that a normal reload still syncs. */
export const STRIPE_WACHT = { everyMs: 5_000, maxTimes: 36 } as const;
