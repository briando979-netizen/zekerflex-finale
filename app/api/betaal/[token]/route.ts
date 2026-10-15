import { NextResponse } from "next/server";
import { toErrorBody, AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { createInvoiceCheckoutSession } from "@/lib/billing/stripe";
import { INVOICE_CHECKOUT_DESCRIPTION } from "@/lib/billing/invoice-descriptions";
import { verifyPayToken } from "@/lib/billing/pay-link";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/betaal/:token — public: start a Stripe Checkout for the invoice
// the signed pay link (QR on the PDF) belongs to. No login: holding the
// invoice is the authorisation, same as a bank transfer with its reference.
export async function POST(request: Request, props: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await props.params;
  try {
    // Each call creates a real Stripe Checkout Session.
    await enforceRateLimit({
      name: "invoice-pay-link",
      identifier: clientIp(request),
      limit: 10,
      windowSeconds: 600,
      message: "Te veel pogingen — probeer het over enkele minuten opnieuw.",
    });

    const invoiceId = verifyPayToken(token);
    if (!invoiceId) throw AppError.notFound("Betaallink ongeldig");

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
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
    if (!invoice || (!invoice.recipientTenantId && !invoice.recipientFreelancerId)) {
      throw AppError.notFound("Factuur niet gevonden");
    }
    if (invoice.status !== "ISSUED") {
      throw AppError.precondition(
        invoice.status === "PAID" ? "Deze factuur is al betaald" : "Deze factuur kan niet online betaald worden",
      );
    }

    const session = await createInvoiceCheckoutSession({
      invoiceId: invoice.id,
      number: invoice.number,
      description: INVOICE_CHECKOUT_DESCRIPTION[invoice.type],
      totalCents: invoice.totalCents,
      currency: invoice.currency,
      successPath: `/betaal/${token}?status=betaald`,
      cancelPath: `/betaal/${token}`,
    });

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    await recordAudit({
      category: "BILLING",
      action: "invoice.checkout_started",
      actorLabel: "pay-link",
      summary: `Stripe checkout gestart via betaallink/QR voor factuur ${invoice.number}`,
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
