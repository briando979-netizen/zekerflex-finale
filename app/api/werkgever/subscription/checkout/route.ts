import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { getPlan, isPlanKey } from "@/lib/api-plans/catalog";
import { createSubscriptionCheckoutSession, ensureStripeCustomer } from "@/lib/billing/stripe";
import { env } from "@/lib/env";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ planKey: z.string() });

// POST /api/werkgever/subscription/checkout — start a Stripe subscription
// Checkout for the caller's tenant. Only self-service plans (not "scale",
// which is sales-negotiated) can be started this way.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    await enforceRateLimit({
      name: "werkgever-subscription-checkout",
      identifier: tenantId,
      limit: 10,
      windowSeconds: 600,
      message: "Te veel pogingen — probeer het over enkele minuten opnieuw.",
    });

    const { planKey } = schema.parse(await request.json().catch(() => ({})));
    if (!isPlanKey(planKey)) throw AppError.validation("Onbekend abonnement");
    const plan = getPlan(planKey);
    if (!plan.selfService || !plan.priceCentsPerMonth) {
      throw AppError.validation("Dit abonnement is op aanvraag — neem contact op met sales@zekerflex.com");
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, stripeCustomerId: true } });
    if (!tenant) throw AppError.notFound("Organisatie niet gevonden");

    const extra = await getOrgProfileExtra(tenantId);
    const stripeCustomerId = await ensureStripeCustomer({
      existingCustomerId: tenant.stripeCustomerId,
      email: extra.billingEmail ?? principal.email,
      name: tenant.name,
      tenantId,
    });
    if (stripeCustomerId !== tenant.stripeCustomerId) {
      await prisma.tenant.update({ where: { id: tenantId }, data: { stripeCustomerId } });
    }

    const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");
    const session = await createSubscriptionCheckoutSession({
      stripeCustomerId,
      planKey: plan.key,
      planLabel: plan.label,
      priceCentsPerMonth: plan.priceCentsPerMonth,
      successUrl: `${baseUrl}/werkgever/integraties?subscribed=${plan.key}`,
      cancelUrl: `${baseUrl}/werkgever/integraties?cancelled=1`,
    });

    await recordAudit({
      category: "BILLING",
      action: "api_subscription.checkout_started",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} startte Checkout voor API-abonnement ${plan.label}`,
      targetType: "tenant",
      targetId: tenantId,
      metadata: { planKey: plan.key },
    });

    if (!session.url) throw AppError.upstream("Stripe gaf geen checkout-url terug");
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
