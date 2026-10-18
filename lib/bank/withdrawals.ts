import { kvFindByField, kvGet, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { buildSepaCreditTransferBatch } from "@/lib/billing/sepa-batch";
import { book } from "@/lib/bank/ledger";

// ---------------------------------------------------------------------------
// Withdrawals from ZekerFlex Bank to someone's own IBAN. Requesting books the
// debit straight away (the money is reserved and can't be spent twice); the
// admin then exports the pending ones as one SEPA batch (pain.001) for the
// platform's business bank and marks them paid — or rejects one, which books
// the amount back.
//   key "bank-withdrawal:<entryId>"
// ---------------------------------------------------------------------------

export type WithdrawalStatus = "pending" | "exported" | "paid" | "reversed";

export interface Withdrawal {
  id: string;
  accountId: string;
  holderName: string;
  amountCents: number;
  iban: string;
  ibanName: string;
  status: WithdrawalStatus;
  requestedAt: string;
  exportedAt?: string;
  settledAt?: string;
  reason?: string;
}

const key = (id: string) => `bank-withdrawal:${id}`;

export async function requestWithdrawal(input: { accountId: string; amountCents: number; requestKey: string }): Promise<Withdrawal> {
  const account = await prisma.bankAccount.findUnique({ where: { id: input.accountId } });
  if (!account) throw AppError.notFound("Rekening niet gevonden");
  if (!account.payoutIban || !account.payoutName) throw AppError.precondition("Stel eerst je eigen IBAN in");
  if (input.amountCents < 100) throw AppError.validation("Minimaal € 1 opnemen");
  const entry = await book(account.id, {
    amountCents: -input.amountCents,
    kind: "WITHDRAWAL",
    description: `Opname naar ${account.payoutIban.slice(0, 4)} …${account.payoutIban.slice(-4)}`,
    counterparty: account.payoutName,
    idempotencyKey: `withdraw:${account.id}:${input.requestKey}`,
  });
  const existing = await kvGet<Withdrawal>(key(entry.id));
  if (existing) return existing;
  const w: Withdrawal = {
    id: entry.id,
    accountId: account.id,
    holderName: account.holderName,
    amountCents: input.amountCents,
    iban: account.payoutIban,
    ibanName: account.payoutName,
    status: "pending",
    requestedAt: new Date().toISOString(),
  };
  await kvSet(key(w.id), w);
  return w;
}

export async function listWithdrawals(filter?: { accountId?: string; status?: WithdrawalStatus[] }): Promise<Withdrawal[]> {
  // Per account, or by status for the admin/batch — both filtered in Postgres.
  const rows = filter?.accountId
    ? await kvFindByField<Withdrawal>("bank-withdrawal:", "accountId", filter.accountId, 200)
    : (await Promise.all((filter?.status ?? ["pending", "exported", "paid", "reversed"]).map((s) => kvFindByField<Withdrawal>("bank-withdrawal:", "status", s, 5000)))).flat();
  return rows
    .filter((w) => (!filter?.accountId || w.accountId === filter.accountId) && (!filter?.status || filter.status.includes(w.status)))
    .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
}

/** One pain.001 file for every pending withdrawal; they become "exported". */
export async function exportPendingWithdrawals(): Promise<{ xml: string; count: number; totalCents: number; skipped: string[] }> {
  if (!env.SEPA_CREDITOR_IBAN || !env.SEPA_CREDITOR_NAME) throw AppError.precondition("SEPA_CREDITOR_IBAN/NAME van ZekerFlex is niet ingesteld");
  const pending = await listWithdrawals({ status: ["pending"] });
  if (pending.length === 0) throw AppError.precondition("Er staan geen opnames klaar");
  const today = new Date().toISOString().slice(0, 10);
  const { xml, results } = buildSepaCreditTransferBatch({
    messageId: `ZFBANK-${Date.now()}`.slice(0, 35),
    debtorName: env.SEPA_CREDITOR_NAME,
    debtorIban: env.SEPA_CREDITOR_IBAN,
    requestedExecutionDate: today,
    lines: pending.map((w) => ({
      endToEndId: `ZFB${w.id}`.slice(0, 35),
      creditorName: w.ibanName,
      creditorIban: w.iban,
      amountCents: w.amountCents,
      remittanceInfo: `ZekerFlex Bank opname ${w.id.slice(-8)}`,
    })),
  });
  if (!xml) throw AppError.precondition("Geen geldige opnames om te exporteren");
  const now = new Date().toISOString();
  const skipped: string[] = [];
  let totalCents = 0;
  for (const [i, r] of results.entries()) {
    const w = pending[i]!;
    if (r.ok) {
      totalCents += w.amountCents;
      await kvSet(key(w.id), { ...w, status: "exported", exportedAt: now } satisfies Withdrawal);
    } else {
      skipped.push(`${w.holderName}: ${r.reason ?? "ongeldig"}`);
    }
  }
  return { xml, count: results.filter((r) => r.ok).length, totalCents, skipped };
}

export async function markWithdrawalPaid(id: string): Promise<Withdrawal> {
  const w = await kvGet<Withdrawal>(key(id));
  if (!w) throw AppError.notFound("Opname niet gevonden");
  if (w.status === "reversed") throw AppError.precondition("Deze opname is teruggeboekt");
  const updated: Withdrawal = { ...w, status: "paid", settledAt: new Date().toISOString() };
  await kvSet(key(id), updated);
  return updated;
}

/** Rejects a withdrawal that wasn't paid out and books the money back. */
export async function reverseWithdrawal(id: string, reason: string): Promise<Withdrawal> {
  const w = await kvGet<Withdrawal>(key(id));
  if (!w) throw AppError.notFound("Opname niet gevonden");
  if (w.status === "paid") throw AppError.precondition("Al uitbetaald — terugboeken kan niet meer");
  if (w.status === "reversed") return w;
  await book(
    w.accountId,
    {
      amountCents: w.amountCents,
      kind: "WITHDRAWAL_REVERSAL",
      description: `Opname teruggeboekt: ${reason}`.slice(0, 200),
      idempotencyKey: `withdraw-reverse:${w.id}`,
    },
    { allowFrozen: true },
  );
  const updated: Withdrawal = { ...w, status: "reversed", settledAt: new Date().toISOString(), reason };
  await kvSet(key(id), updated);
  return updated;
}
