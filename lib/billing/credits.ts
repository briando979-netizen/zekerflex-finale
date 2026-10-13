import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// There is no bank rail to pay a tenant/employer out directly (only
// freelancers have a Stripe Connect account) — so when a freelancer pays an
// employer_owed cancellation-penalty claim, the amount is recorded as a
// TenantCredit (see app/api/webhooks/stripe/route.ts) instead of transferred.
// This deducts any unused credits from the next PLATFORM_FEE invoice that
// tenant is issued, as a VAT-exempt discount line — called from inside the
// same transaction that persists that invoice (lib/timesheets/approve.ts).
// ---------------------------------------------------------------------------

export async function applyPendingTenantCredits(
  tx: Prisma.TransactionClient,
  tenantId: string,
  invoiceId: string,
  invoiceTotalCents: number,
): Promise<void> {
  const pending = await tx.tenantCredit.findMany({
    where: { tenantId, appliedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return;

  let remaining = invoiceTotalCents;
  let appliedCents = 0;
  for (const credit of pending) {
    if (remaining <= 0) break;
    const useCents = Math.min(credit.amountCents, remaining);
    remaining -= useCents;
    appliedCents += useCents;

    if (useCents === credit.amountCents) {
      // Fully consumed by this invoice.
      await tx.tenantCredit.update({
        where: { id: credit.id },
        data: { appliedAt: new Date(), appliedToInvoiceId: invoiceId },
      });
    } else {
      // Partially consumed — shrink this credit by what was used and leave
      // the remainder open for the tenant's next invoice. A separate,
      // fully-applied row records what this invoice actually took.
      await tx.tenantCredit.update({
        where: { id: credit.id },
        data: { amountCents: { decrement: useCents } },
      });
      await tx.tenantCredit.create({
        data: {
          tenantId,
          amountCents: useCents,
          reason: credit.reason,
          sourceClaimId: credit.sourceClaimId,
          appliedAt: new Date(),
          appliedToInvoiceId: invoiceId,
        },
      });
    }
  }
  if (appliedCents <= 0) return;

  await tx.invoiceLine.create({
    data: {
      invoiceId,
      description: "Verrekening eerdere annuleringsvergoeding (geen btw)",
      quantity: 1,
      unitPriceCents: -appliedCents,
      amountCents: -appliedCents,
    },
  });
  await tx.invoice.update({
    where: { id: invoiceId },
    data: { subtotalCents: { decrement: appliedCents }, totalCents: { decrement: appliedCents } },
  });
}
