import { randomBytes } from "node:crypto";
import type { BankAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { kvFindByField, kvGet, kvSet } from "@/lib/storage/kv";
import { transfer } from "@/lib/bank/ledger";
import { checkLowBalance, notifyIncoming } from "@/lib/bank/notify";

// ---------------------------------------------------------------------------
// Money between ZekerFlex Bank accounts: send to an account number (instant,
// both legs in one transaction) and payment requests ("betaalverzoek") with
// a link + QR that any ZekerFlex account holder can pay in one tap.
//   key "bank-request:<id>"
// ---------------------------------------------------------------------------

export const DAILY_SEND_LIMIT_CENTS = 250_000; // € 2.500 per day per account
const REQUEST_DAYS = 30;

export interface PaymentRequest {
  id: string;
  accountId: string;
  holderName: string;
  amountCents: number;
  description: string;
  status: "open" | "paid" | "cancelled";
  createdAt: string;
  expiresAt: string;
  paidAt?: string;
  paidBy?: string;
}

const requestKey = (id: string) => `bank-request:${id}`;

export function normaliseNumber(input: string): string {
  return input.replace(/\s/g, "").toUpperCase();
}

export async function findByNumber(number: string): Promise<BankAccount | null> {
  const n = normaliseNumber(number);
  if (!/^ZF\d{10}$/.test(n)) return null;
  return prisma.bankAccount.findUnique({ where: { number: n } });
}

async function sentToday(accountId: string): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const agg = await prisma.bankEntry.aggregate({ where: { accountId, kind: "TRANSFER", amountCents: { lt: 0 }, createdAt: { gte: start } }, _sum: { amountCents: true } });
  return -(agg._sum.amountCents ?? 0);
}

export async function sendMoney(input: { from: BankAccount; toNumber: string; amountCents: number; description: string; requestKey: string }): Promise<{ toHolder: string }> {
  const to = await findByNumber(input.toNumber);
  if (!to) throw AppError.notFound("Dit ZekerFlex-rekeningnummer bestaat niet");
  if (to.id === input.from.id) throw AppError.validation("Je kunt niet naar je eigen rekening overmaken");
  if (to.ownerType === "PLATFORM") throw AppError.validation("Naar de platformrekening kun je niet overmaken");
  if (to.frozenAt) throw AppError.precondition("De ontvangende rekening kan nu geen geld ontvangen");
  if ((await sentToday(input.from.id)) + input.amountCents > DAILY_SEND_LIMIT_CENTS) {
    throw AppError.precondition(`Daglimiet van € ${DAILY_SEND_LIMIT_CENTS / 100} bereikt`);
  }
  const note = input.description.trim().slice(0, 140);
  await transfer({
    fromAccountId: input.from.id,
    toAccountId: to.id,
    amountCents: input.amountCents,
    kind: "TRANSFER",
    description: note ? `Naar ${to.holderName}: ${note}` : `Naar ${to.holderName}`,
    toDescription: note ? `Van ${input.from.holderName}: ${note}` : `Van ${input.from.holderName}`,
    fromCounterparty: to.holderName,
    toCounterparty: input.from.holderName,
    idempotencyKey: `send:${input.from.id}:${input.requestKey}`,
  });
  await notifyIncoming(to.id, input.amountCents, input.from.holderName);
  await checkLowBalance(input.from.id);
  return { toHolder: to.holderName };
}

export async function createRequest(input: { account: BankAccount; amountCents: number; description: string }): Promise<PaymentRequest> {
  const now = new Date();
  const r: PaymentRequest = {
    id: randomBytes(9).toString("base64url"),
    accountId: input.account.id,
    holderName: input.account.holderName,
    amountCents: input.amountCents,
    description: input.description.trim().slice(0, 140),
    status: "open",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + REQUEST_DAYS * 86_400_000).toISOString(),
  };
  await kvSet(requestKey(r.id), r);
  return r;
}

export async function getRequest(id: string): Promise<PaymentRequest | null> {
  if (!/^[\w-]{6,30}$/.test(id)) return null;
  const r = await kvGet<PaymentRequest>(requestKey(id));
  if (r && r.status === "open" && new Date(r.expiresAt) < new Date()) return { ...r, status: "cancelled" };
  return r;
}

export async function listRequests(accountId: string): Promise<PaymentRequest[]> {
  return (await kvFindByField<PaymentRequest>("bank-request:", "accountId", accountId, 100)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function payRequest(id: string, payer: BankAccount): Promise<PaymentRequest> {
  const r = await getRequest(id);
  if (!r) throw AppError.notFound("Betaalverzoek niet gevonden");
  if (r.status !== "open") throw AppError.precondition(r.status === "paid" ? "Dit verzoek is al betaald" : "Dit verzoek is verlopen of ingetrokken");
  if (r.accountId === payer.id) throw AppError.validation("Je kunt je eigen verzoek niet betalen");
  await transfer({
    fromAccountId: payer.id,
    toAccountId: r.accountId,
    amountCents: r.amountCents,
    kind: "TRANSFER",
    description: `Betaalverzoek ${r.holderName}${r.description ? `: ${r.description}` : ""}`,
    toDescription: `Betaalverzoek betaald door ${payer.holderName}${r.description ? `: ${r.description}` : ""}`,
    fromCounterparty: r.holderName,
    toCounterparty: payer.holderName,
    reference: r.id,
    idempotencyKey: `request-pay:${r.id}`,
  });
  const paid: PaymentRequest = { ...r, status: "paid", paidAt: new Date().toISOString(), paidBy: payer.holderName };
  await kvSet(requestKey(r.id), paid);
  await notifyIncoming(r.accountId, r.amountCents, `${payer.holderName} (betaalverzoek)`);
  await checkLowBalance(payer.id);
  return paid;
}

/** Paid outside the bank (iDEAL via the webhook): only the status changes here. */
export async function markRequestPaidExternally(id: string, payer: string): Promise<void> {
  const r = await kvGet<PaymentRequest>(requestKey(id));
  if (!r || r.status === "paid") return;
  await kvSet(requestKey(id), { ...r, status: "paid", paidAt: new Date().toISOString(), paidBy: payer } satisfies PaymentRequest);
}

export async function cancelRequest(id: string, accountId: string): Promise<void> {
  const r = await getRequest(id);
  if (!r || r.accountId !== accountId) throw AppError.notFound("Betaalverzoek niet gevonden");
  if (r.status === "open") await kvSet(requestKey(id), { ...r, status: "cancelled" } satisfies PaymentRequest);
}
