import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { createInvoiceCheckoutSession } from "@/lib/billing/stripe";
import { INVOICE_CHECKOUT_DESCRIPTION } from "@/lib/billing/invoice-descriptions";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/invoices/:id/checkout — start a Stripe Checkout Session so the
// employer can pay an ISSUED invoice online. Returns { url } to redirect to.
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await props.params;
  try {
    const principal = await requirePrincipal();

    // Each call creates a real Stripe Checkout Session — cap retries per user.
    await enforceRateLimit({
      name: "invoice-checkout",
      identifier: principal.userId,
      limit: 10,
      windowSeconds: 600,
      message: "Te veel pogingen — probeer het over enkele minuten opnieuw.",
    });

    const scope = await resolveEmployerScope(principal);

    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        totalCents: true,
        currency: true,
        recipientTenantId: true,
        recipientFreelancerId: true,
      },
    });
    if (!invoice) throw AppError.notFound("Factuur niet gevonden");

    let billingEmail: string | null = null;
    if (invoice.recipientTenantId) {
      if (!scope.tenantIds.includes(invoice.recipientTenantId)) {
        throw AppError.forbidden("Geen toegang tot deze factuur");
      }
      const billing = await getOrgProfileExtra(invoice.recipientTenantId);
      billingEmail = billing.billingEmail ?? null;
    } else if (invoice.recipientFreelancerId) {
      const ownProfile = await prisma.freelancerProfile.findUnique({ where: { userId: principal.userId }, select: { id: true, user: { select: { email: true } } } });
      if (!ownProfile || ownProfile.id !== invoice.recipientFreelancerId) {
        throw AppError.forbidden("Geen toegang tot deze factuur");
      }
      billingEmail = ownProfile.user.email;
    } else {
      throw AppError.forbidden("Geen toegang tot deze factuur");
    }

    if (invoice.status !== "ISSUED") {
      throw AppError.precondition("Alleen openstaande facturen kunnen betaald worden");
    }

    const description = INVOICE_CHECKOUT_DESCRIPTION[invoice.type];

    const session = await createInvoiceCheckoutSession({
      invoiceId: invoice.id,
      number: invoice.number,
      description,
      totalCents: invoice.totalCents,
      currency: invoice.currency,
      billingEmail,
    });

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    await recordAudit({
      category: "BILLING",
      action: "invoice.checkout_started",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Stripe checkout gestart voor factuur ${invoice.number}`,
      targetType: "invoice",
      targetId: invoice.id,
      metadata: { sessionId: session.id, amountCents: invoice.totalCents },
    });

    if (!session.url) throw AppError.upstream("Stripe gaf geen checkout-url terug");
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
