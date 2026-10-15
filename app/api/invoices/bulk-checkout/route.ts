import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { createBulkInvoiceCheckoutSession } from "@/lib/billing/stripe";
import { INVOICE_CHECKOUT_DESCRIPTION } from "@/lib/billing/invoice-descriptions";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema = z.object({ invoiceIds: z.array(z.string().min(1)).min(1).max(50) });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/invoices/bulk-checkout — "Direct betalen" voor meerdere
// aangevinkte openstaande facturen in één Stripe Checkout Session.
export async function POST(request: Request): Promise<Response> {
  try {
    const principal = await requirePrincipal();

    await enforceRateLimit({
      name: "invoice-bulk-checkout",
      identifier: principal.userId,
      limit: 10,
      windowSeconds: 600,
      message: "Te veel pogingen — probeer het over enkele minuten opnieuw.",
    });

    const { invoiceIds } = schema.parse(await request.json());
    const scope = await resolveEmployerScope(principal);

    const invoices = await prisma.invoice.findMany({
      where: { id: { in: invoiceIds } },
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
    if (invoices.length !== invoiceIds.length) {
      throw AppError.notFound("Een of meer facturen zijn niet gevonden");
    }
    if (invoices.some((i) => !i.recipientTenantId || !scope.tenantIds.includes(i.recipientTenantId))) {
      throw AppError.forbidden("Geen toegang tot een of meer van deze facturen");
    }
    if (invoices.some((i) => i.status !== "ISSUED")) {
      throw AppError.precondition("Alleen openstaande facturen kunnen samen betaald worden");
    }
    const currencies = new Set(invoices.map((i) => i.currency));
    if (currencies.size > 1) {
      throw AppError.validation("Facturen met verschillende valuta kunnen niet samen worden afgerekend");
    }

    const billing = invoices[0]!.recipientTenantId ? await getOrgProfileExtra(invoices[0]!.recipientTenantId!) : {};

    const session = await createBulkInvoiceCheckoutSession({
      invoices: invoices.map((i) => ({
        invoiceId: i.id,
        number: i.number,
        description: INVOICE_CHECKOUT_DESCRIPTION[i.type],
        totalCents: i.totalCents,
      })),
      currency: invoices[0]!.currency,
      billingEmail: billing.billingEmail ?? null,
    });

    await prisma.invoice.updateMany({
      where: { id: { in: invoiceIds } },
      data: { stripeCheckoutSessionId: session.id },
    });

    await recordAudit({
      category: "BILLING",
      action: "invoice.bulk_checkout_started",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Stripe checkout gestart voor ${invoices.length} facturen samen`,
      targetType: "invoice",
      targetId: invoiceIds.join(","),
      metadata: { sessionId: session.id, invoiceIds, totalCents: invoices.reduce((s, i) => s + i.totalCents, 0) },
    });

    if (!session.url) throw AppError.upstream("Stripe gaf geen checkout-url terug");
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
