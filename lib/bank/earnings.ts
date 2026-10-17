import { kvGet, kvSet } from "@/lib/storage/kv";
import { personalAccount } from "@/lib/bank/accounts";
import { book, type BookedEntry } from "@/lib/bank/ledger";
import { applyEarningRule } from "@/lib/bank/autosave";

// ---------------------------------------------------------------------------
// Earnings straight onto ZekerFlex Bank. A freelancer can choose to receive
// approved hours on their bank account instead of their own IBAN: the payout
// is then an EARNING booking (instant, no SEPA round trip). The choice lives
// in KV "bank-payout-pref:<userId>"; default stays the IBAN.
// ---------------------------------------------------------------------------

export type PayoutDestination = "iban" | "bank";

const key = (userId: string) => `bank-payout-pref:${userId}`;

export async function getPayoutDestination(userId: string): Promise<PayoutDestination> {
  return (await kvGet<PayoutDestination>(key(userId))) === "bank" ? "bank" : "iban";
}

export async function setPayoutDestination(userId: string, destination: PayoutDestination): Promise<void> {
  await kvSet(key(userId), destination);
}

/** Books a payout as earnings; the idempotency key makes a retried approval one credit. */
export async function creditEarning(input: {
  userId: string;
  holderName: string;
  amountCents: number;
  description: string;
  counterparty: string;
  reference: string;
  idempotencyKey: string;
}): Promise<{ entry: BookedEntry; accountNumber: string }> {
  const account = await personalAccount(input.userId, input.holderName);
  const entry = await book(
    account.id,
    {
      amountCents: input.amountCents,
      kind: "EARNING",
      description: input.description,
      counterparty: input.counterparty,
      reference: input.reference,
      idempotencyKey: input.idempotencyKey,
    },
    { allowFrozen: true },
  );
  if (entry.created && input.idempotencyKey.startsWith("earning:")) await applyEarningRule(account.id, input.amountCents, entry.id);
  return { entry, accountNumber: account.number };
}
