import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { createBillingPortalSession } from "@/lib/billing/stripe";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/werkgever/subscription/portal — Stripe-hosted portal to change plan, update payment method, or cancel.
export async function POST(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { stripeCustomerId: true } });
    if (!tenant?.stripeCustomerId) {
      throw AppError.precondition("Nog geen betaald abonnement om te beheren");
    }

    const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");
    const session = await createBillingPortalSession(tenant.stripeCustomerId, `${baseUrl}/werkgever/integraties`);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
