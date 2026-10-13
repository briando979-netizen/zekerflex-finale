import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { transferToConnectedAccount } from "@/lib/billing/stripe";
import { payoutEndToEndId } from "@/lib/billing/sepa";
import { getClaim, markClaimPaid } from "@/lib/claims/store";

export type PaidPenaltyInvoice = {
  id: string;
  number: string;
  totalCents: number;
  currency: string;
  claimId: string | null;
};

/**
 * A CANCELLATION_PENALTY invoice just got paid (called from the Stripe
 * webhook) — settle the other side:
 *  - freelancer_owed: the employer paid, so transfer the 50% to the
 *    freelancer's Stripe Connect account (the existing SEPA/payout rails
 *    never read CancellationClaim, so this was previously just a promise in
 *    the UI/mail copy that nothing ever fulfilled).
 *  - employer_owed: the freelancer paid. There's no bank rail to pay a
 *    tenant out directly, so it's recorded as a TenantCredit and deducted
 *    from that tenant's next generated invoice instead (see
 *    lib/billing/credits.ts).
 */
export async function fulfillPaidClaim(invoice: PaidPenaltyInvoice): Promise<void> {
  if (!invoice.claimId) return;
  const claim = await getClaim(invoice.claimId);
  if (!claim) {
    logger.warn("stripe webhook: claim not found for paid penalty invoice", { invoiceId: invoice.id, claimId: invoice.claimId });
    return;
  }

  if (claim.direction === "freelancer_owed") {
    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: claim.freelancerUserId },
      select: { id: true, stripeConnectedAccountId: true, stripePayoutsEnabled: true },
    });
    if (!profile?.stripeConnectedAccountId || !profile.stripePayoutsEnabled) {
      logger.warn("claim paid but freelancer has no usable Stripe Connect account — payout needs manual handling", {
        claimId: claim.id,
        freelancerUserId: claim.freelancerUserId,
      });
      await recordAudit({
        category: "BILLING",
        action: "claim.payout_blocked",
        actorLabel: "system",
        summary: `Claim ${claim.id} is betaald maar kan niet automatisch worden uitbetaald — freelancer heeft geen actieve Stripe Connect-koppeling`,
        targetType: "claim",
        targetId: claim.id,
      });
    } else {
      await transferToConnectedAccount({
        endToEndId: payoutEndToEndId(invoice.id),
        amountCents: invoice.totalCents,
        currency: invoice.currency,
        destinationAccountId: profile.stripeConnectedAccountId,
        description: `Annuleringsvergoeding factuur ${invoice.number}`,
      });
      await recordAudit({
        category: "BILLING",
        action: "claim.payout_transferred",
        actorLabel: "system",
        summary: `Annuleringsvergoeding van factuur ${invoice.number} overgemaakt naar freelancer`,
        targetType: "claim",
        targetId: claim.id,
        metadata: { amountCents: invoice.totalCents },
      });
    }
  } else {
    await prisma.tenantCredit.create({
      data: {
        tenantId: claim.employerTenantId,
        amountCents: invoice.totalCents,
        reason: `Annuleringsvergoeding — "${claim.shiftTitle}" (te laat afgezegd/niet opgekomen)`,
        sourceClaimId: claim.id,
      },
    });
    await recordAudit({
      category: "BILLING",
      action: "claim.tenant_credited",
      actorLabel: "system",
      summary: `Tegoed van ${(invoice.totalCents / 100).toFixed(2)} geboekt voor tenant ${claim.employerTenantId} (claim ${claim.id})`,
      targetType: "claim",
      targetId: claim.id,
      metadata: { tenantId: claim.employerTenantId, amountCents: invoice.totalCents },
    });
  }

  await markClaimPaid(claim.id);
}
