import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// ZekerFlex Bank ledger. Every change to a balance is one BankEntry, written
// in the same transaction as the balance update. Debits use a conditional
// update ("balance >= amount"), so two payments racing for the same euro can
// never both succeed. idempotencyKey makes a replayed Stripe event or a
// double-clicked button a no-op that returns the original booking.
// ---------------------------------------------------------------------------

export type BankEntryKind =
  | "TOPUP"
  | "WITHDRAWAL"
  | "WITHDRAWAL_REVERSAL"
  | "FEE_MONTHLY"
  | "FEE_CARD"
  | "CARD_SPEND"
  | "CARD_REFUND"
  | "INVOICE_PAYMENT"
  | "EARNING"
  | "TRANSFER"
  | "ADJUSTMENT";

export interface Booking {
  amountCents: number;
  kind: BankEntryKind;
  description: string;
  counterparty?: string | null;
  reference?: string | null;
  idempotencyKey: string;
}

export interface BookedEntry {
  id: string;
  accountId: string;
  amountCents: number;
  balanceAfterCents: number;
  kind: string;
  description: string;
  createdAt: Date;
  /** false when this idempotency key was already booked earlier */
  created: boolean;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

interface BookOptions {
  allowFrozen?: boolean;
  /** Card captures already happened at the merchant — book them even past zero. */
  allowNegative?: boolean;
}

async function bookInTx(tx: Tx, accountId: string, b: Booking, opts: BookOptions): Promise<BookedEntry> {
  if (!Number.isInteger(b.amountCents) || b.amountCents === 0) throw AppError.validation("Ongeldig bedrag");
  const existing = await tx.bankEntry.findUnique({ where: { idempotencyKey: b.idempotencyKey } });
  if (existing) return { ...existing, created: false };

  if (b.amountCents < 0) {
    const account = await tx.bankAccount.findUnique({ where: { id: accountId }, select: { frozenAt: true } });
    if (!account) throw AppError.notFound("Rekening niet gevonden");
    if (account.frozenAt && !opts.allowFrozen) throw AppError.precondition("Deze rekening is geblokkeerd");
  }

  const updated = await tx.bankAccount.updateMany({
    where: { id: accountId, ...(b.amountCents < 0 && !opts.allowNegative ? { balanceCents: { gte: -b.amountCents } } : {}) },
    data: { balanceCents: { increment: b.amountCents } },
  });
  if (updated.count === 0) {
    const exists = await tx.bankAccount.count({ where: { id: accountId } });
    throw exists ? AppError.precondition("Onvoldoende saldo") : AppError.notFound("Rekening niet gevonden");
  }
  const { balanceCents } = await tx.bankAccount.findUniqueOrThrow({ where: { id: accountId }, select: { balanceCents: true } });
  const entry = await tx.bankEntry.create({
    data: {
      accountId,
      amountCents: b.amountCents,
      balanceAfterCents: balanceCents,
      kind: b.kind,
      description: b.description.slice(0, 200),
      counterparty: b.counterparty?.slice(0, 120) ?? null,
      reference: b.reference?.slice(0, 120) ?? null,
      idempotencyKey: b.idempotencyKey,
    },
  });
  return { ...entry, created: true };
}

/** Books one entry on one account. */
export async function book(accountId: string, b: Booking, opts: BookOptions = {}): Promise<BookedEntry> {
  return prisma.$transaction((tx) => bookInTx(tx, accountId, b, opts));
}

/**
 * Moves money between two accounts atomically (fees to the platform, an
 * employer paying a freelancer …): both entries or neither.
 */
export async function transfer(input: {
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  kind: BankEntryKind;
  description: string;
  toDescription?: string;
  fromCounterparty?: string;
  toCounterparty?: string;
  reference?: string | null;
  idempotencyKey: string;
  allowFrozen?: boolean;
}): Promise<{ debit: BookedEntry; credit: BookedEntry }> {
  if (input.amountCents <= 0) throw AppError.validation("Ongeldig bedrag");
  return prisma.$transaction(async (tx) => {
    const debit = await bookInTx(
      tx,
      input.fromAccountId,
      {
        amountCents: -input.amountCents,
        kind: input.kind,
        description: input.description,
        counterparty: input.fromCounterparty ?? null,
        reference: input.reference ?? null,
        idempotencyKey: `${input.idempotencyKey}:out`,
      },
      { allowFrozen: input.allowFrozen ?? false },
    );
    const credit = await bookInTx(
      tx,
      input.toAccountId,
      {
        amountCents: input.amountCents,
        kind: input.kind,
        description: input.toDescription ?? input.description,
        counterparty: input.toCounterparty ?? null,
        reference: input.reference ?? null,
        idempotencyKey: `${input.idempotencyKey}:in`,
      },
      {},
    );
    return { debit, credit };
  });
}
