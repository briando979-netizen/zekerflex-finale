import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import {
  createAccountLoginLink,
  createAccountOnboardingLink,
  createExpressAccount,
  getConnectAccountStatus,
} from "@/lib/billing/stripe";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadProfile(userId: string) {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true, stripeConnectedAccountId: true, stripePayoutsEnabled: true },
  });
  if (!profile) throw AppError.forbidden("Geen freelancerprofiel gevonden");
  return profile;
}

// GET /api/me/payout/stripe-connect — current status, synced live from Stripe
// when a link exists but isn't marked enabled yet (don't wait on the webhook).
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const profile = await loadProfile(p.userId);

    if (!profile.stripeConnectedAccountId) {
      return NextResponse.json({ connected: false, payoutsEnabled: false });
    }
    if (profile.stripePayoutsEnabled) {
      return NextResponse.json({ connected: true, payoutsEnabled: true });
    }
    const status = await getConnectAccountStatus(profile.stripeConnectedAccountId);
    if (status.payoutsEnabled !== profile.stripePayoutsEnabled) {
      await prisma.freelancerProfile.update({
        where: { id: profile.id },
        data: { stripePayoutsEnabled: status.payoutsEnabled },
      });
    }
    return NextResponse.json({ connected: true, ...status });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/me/payout/stripe-connect — start (or resume) onboarding; returns
// { url } to redirect the freelancer to. Once payouts are enabled, returns a
// Stripe Express dashboard login link instead.
export async function POST(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    const profile = await loadProfile(p.userId);
    const baseUrl = env.APP_BASE_URL.replace(/\/$/, "");

    if (profile.stripeConnectedAccountId && profile.stripePayoutsEnabled) {
      const url = await createAccountLoginLink(profile.stripeConnectedAccountId);
      return NextResponse.json({ url });
    }

    let accountId = profile.stripeConnectedAccountId;
    if (!accountId) {
      const account = await createExpressAccount({ email: p.email });
      accountId = account.id;
      await prisma.freelancerProfile.update({
        where: { id: profile.id },
        data: { stripeConnectedAccountId: accountId },
      });
      await recordAudit({
        category: "BILLING",
        action: "freelancer.stripe_connect_started",
        actorUserId: p.userId,
        actorLabel: "user",
        summary: "Stripe Connect-onboarding gestart",
        targetType: "freelancer_profile",
        targetId: profile.id,
        metadata: { accountId },
      });
    }

    const link = await createAccountOnboardingLink(accountId, {
      returnUrl: `${baseUrl}/dashboard/profiel?stripe=return`,
      refreshUrl: `${baseUrl}/dashboard/profiel?stripe=refresh`,
    });
    return NextResponse.json({ url: link.url });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
