import type { InvoiceType, Prisma } from "@prisma/client";

const PREFIX: Record<InvoiceType, string> = {
  SELF_BILL_FREELANCER: "ZF-SB",
  PLATFORM_FEE: "ZF-PF",
};

/**
 * Reserve the next gap-free invoice number for a type within the given
 * transaction. Uses an upsert + atomic increment; callers MUST pass the
 * transactional client so the reservation commits with the invoice itself.
 */
export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  type: InvoiceType,
  when: Date = new Date(),
): Promise<string> {
  const year = when.getUTCFullYear();
  const seq = await tx.invoiceSequence.upsert({
    where: { type_year: { type, year } },
    create: { type, year, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });
  const serial = String(seq.lastValue).padStart(6, "0");
  return `${PREFIX[type]}-${year}-${serial}`;
}
