import { NextResponse } from "next/server";
import { InvoiceType } from "@prisma/client";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { createInvoiceCheckoutSession } from "@/lib/billing/stripe";
import { recordAudit } from "@/lib/audit";
import { fixedWindow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/invoices/:id/checkout — start a Stripe Checkout Session so the
// employer can pay an ISSUED invoice online. Returns { url } to redirect to.
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const principal = await requirePrincipal();

    // Each call creates a real Stripe Checkout Session — cap retries per user.
    const gate = await fixedWindow(`invoice-checkout:rl:${principal.userId}`, 10, 600);
    if (!gate.ok) {
      throw AppError.validation("Te veel pogingen — probeer het over enkele minuten opnieuw.");
    }

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
      },
    });
    if (!invoice) throw AppError.notFound("Factuur niet gevonden");
    if (!scope.tenantIds.includes(invoice.recipientTenantId)) {
      throw AppError.forbidden("Geen toegang tot deze factuur");
    }
    if (invoice.status !== "ISSUED") {
      throw AppError.precondition("Alleen openstaande facturen kunnen betaald worden");
    }

    const billing = await getOrgProfileExtra(invoice.recipientTenantId);
    const description =
      invoice.type === InvoiceType.PLATFORM_FEE
        ? "ZekerFlex platformfee"
        : "ZekerFlex dienst (zzp)";

    const session = await createInvoiceCheckoutSession({
      invoiceId: invoice.id,
      number: invoice.number,
      description,
      totalCents: invoice.totalCents,
      currency: invoice.currency,
      billingEmail: billing.billingEmail ?? null,
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
