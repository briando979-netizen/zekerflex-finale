import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { isSaasPlanKey, saasPlan } from "@/lib/billing/saas-plans";
import { createSubscriptionCheckoutSession, ensureStripeCustomer } from "@/lib/billing/stripe";
import { env } from "@/lib/env";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ planKey: z.string() });

// POST /api/werkgever/saas-subscription/checkout — start een maand-abonnement
// (Pro/Business) voor de tenant van de ingelogde werkgever. Enterprise = op
// aanvraag (sales). Hergebruikt dezelfde Stripe-subscription-flow als de API-plannen.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    await enforceRateLimit({
      name: "werkgever-saas-checkout",
      identifier: tenantId,
      limit: 10,
      windowSeconds: 600,
      message: "Te veel pogingen — probeer het over enkele minuten opnieuw.",
    });

    const { planKey } = schema.parse(await request.json().catch(() => ({})));
    if (!isSaasPlanKey(planKey)) throw AppError.validation("Onbekend abonnement");
    const plan = saasPlan(planKey);
    if (!plan || !plan.selfService || !plan.priceCentsPerMonth) {
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
      planKey: `saas:${plan.key}`,
      planLabel: `ZekerFlex ${plan.label}`,
      priceCentsPerMonth: plan.priceCentsPerMonth,
      successUrl: `${baseUrl}/werkgever?subscribed=${plan.key}`,
      cancelUrl: `${baseUrl}/abonnementen?cancelled=1`,
    });

    await recordAudit({
      category: "BILLING",
      action: "saas_subscription.checkout_started",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} startte Checkout voor abonnement ${plan.label}`,
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
