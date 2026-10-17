import { InvoiceStatus, InvoiceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { fulfillPaidClaim } from "@/lib/claims/fulfillment";
import { platformAccount } from "@/lib/bank/accounts";
import { transfer } from "@/lib/bank/ledger";

/**
 * Pays an open invoice from a ZekerFlex Bank account: the organisation (or,
 * for a cancellation claim, the freelancer) it is addressed to pays the
 * platform account, and the invoice ends up exactly where a Stripe payment
 * would put it (PAID, claim fulfilled).
 */
export async function payInvoiceFromBank(input: { invoiceId: string; accountId: string; actorUserId: string }): Promise<void> {
  const [invoice, account] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { id: true, number: true, status: true, type: true, claimId: true, totalCents: true, currency: true, recipientTenantId: true, recipientFreelancerId: true },
    }),
    prisma.bankAccount.findUnique({ where: { id: input.accountId } }),
  ]);
  if (!invoice || !account) throw AppError.notFound("Factuur of rekening niet gevonden");

  let owner = false;
  if (account.tenantId && invoice.recipientTenantId === account.tenantId) owner = true;
  if (!owner && account.userId && invoice.recipientFreelancerId) {
    const fp = await prisma.freelancerProfile.findUnique({ where: { userId: account.userId }, select: { id: true } });
    owner = fp?.id === invoice.recipientFreelancerId;
  }
  if (!owner) throw AppError.forbidden("Deze factuur is niet aan deze rekening gericht");
  if (invoice.status === InvoiceStatus.PAID) return;
  if (invoice.status !== InvoiceStatus.ISSUED) throw AppError.precondition("Alleen openstaande facturen kunnen betaald worden");
  if (invoice.currency.toUpperCase() !== account.currency) throw AppError.precondition("Valuta van factuur en rekening verschillen");

  const platform = await platformAccount();
  await transfer({
    fromAccountId: account.id,
    toAccountId: platform.id,
    amountCents: invoice.totalCents,
    kind: "INVOICE_PAYMENT",
    description: `Factuur ${invoice.number}`,
    toDescription: `Factuur ${invoice.number} betaald door ${account.holderName}`,
    fromCounterparty: "ZekerFlex B.V.",
    toCounterparty: account.holderName,
    reference: invoice.id,
    idempotencyKey: `invoice-pay:${invoice.id}`,
  });
  const updated = await prisma.invoice.updateMany({
    where: { id: invoice.id, status: InvoiceStatus.ISSUED },
    data: { status: InvoiceStatus.PAID, paidAt: new Date() },
  });
  if (updated.count === 0) return;
  await recordAudit({
    category: "BILLING",
    action: "invoice.paid",
    actorUserId: input.actorUserId,
    summary: `Factuur ${invoice.number} betaald vanaf ZekerFlex Bank`,
    targetType: "invoice",
    targetId: invoice.id,
    metadata: { bankAccountId: account.id },
  });
  if (invoice.type === InvoiceType.CANCELLATION_PENALTY && invoice.claimId) {
    await fulfillPaidClaim(invoice);
  }
}
