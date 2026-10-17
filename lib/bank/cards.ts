import type Stripe from "stripe";
import type { BankAccount, BankCard } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { getStripeClient } from "@/lib/billing/stripe";
import { platformAccount } from "@/lib/bank/accounts";
import { getFees } from "@/lib/bank/fees";
import { book, transfer } from "@/lib/bank/ledger";

// ---------------------------------------------------------------------------
// ZekerFlex Bank payment cards (Stripe Issuing, on the platform account).
// Users request a card themselves; the one-off card fee goes to the platform
// account first and is refunded if Stripe refuses the card.
//
// Every card payment is checked against the ledger in real time
// (issuing_authorization.request): approve only when the account isn't
// frozen, the card is active and the balance covers it. The approved amount
// is debited at once as a hold; the captured amount settles against that
// hold, and whatever is left of the hold is released when the authorization
// closes or is reversed. Refunds come back as CARD_REFUND.
//   key "bank-card-hold:<authorizationId>"  → { accountId, heldCents }
// ---------------------------------------------------------------------------

export type CardType = "virtual" | "physical";

export interface CardholderDetails {
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD */
  dob: string;
  phone?: string;
  line1: string;
  postalCode: string;
  city: string;
  country: string;
  termsAcceptedIp: string;
  termsAcceptedUserAgent: string;
}

interface Hold {
  accountId: string;
  heldCents: number;
}
const holdKey = (authId: string) => `bank-card-hold:${authId}`;

export async function listCards(accountId: string): Promise<BankCard[]> {
  return prisma.bankCard.findMany({ where: { accountId }, orderBy: { createdAt: "desc" } });
}

async function ensureCardholder(account: BankAccount, d: CardholderDetails, email: string | null): Promise<string> {
  const existing = await prisma.bankCard.findFirst({ where: { accountId: account.id }, select: { stripeCardholderId: true } });
  if (existing) return existing.stripeCardholderId;
  const stripe = getStripeClient();
  const [year, month, day] = d.dob.split("-").map(Number);
  const holder = await stripe.issuing.cardholders.create({
    type: account.ownerType === "TENANT" ? "company" : "individual",
    name: account.ownerType === "TENANT" ? account.holderName.slice(0, 24) : `${d.firstName} ${d.lastName}`.slice(0, 24),
    ...(email ? { email } : {}),
    ...(d.phone ? { phone_number: d.phone } : {}),
    billing: { address: { line1: d.line1, postal_code: d.postalCode, city: d.city, country: d.country } },
    individual: {
      first_name: d.firstName,
      last_name: d.lastName,
      ...(year && month && day ? { dob: { year, month, day } } : {}),
      card_issuing: {
        user_terms_acceptance: { date: Math.floor(Date.now() / 1000), ip: d.termsAcceptedIp, user_agent: d.termsAcceptedUserAgent },
      },
    },
    metadata: { bankAccountId: account.id },
  });
  return holder.id;
}

/** The holder requests a card: pay the fee, create cardholder + card. */
export async function requestCard(input: {
  account: BankAccount;
  type: CardType;
  details: CardholderDetails;
  email: string | null;
  requestKey: string;
}): Promise<BankCard> {
  const { account, type, details } = input;
  if (account.ownerType === "PLATFORM") throw AppError.validation("De platformrekening krijgt geen pas");
  if (account.frozenAt) throw AppError.precondition("Deze rekening is geblokkeerd");
  const active = await prisma.bankCard.count({ where: { accountId: account.id, status: { in: ["active", "inactive"] } } });
  if (active >= 5) throw AppError.precondition("Je hebt al 5 passen — zeg er eerst een op");

  const fee = type === "physical" ? (await getFees()).cardPhysicalCents : (await getFees()).cardVirtualCents;
  const platform = await platformAccount();
  const feeKey = `card-fee:${account.id}:${input.requestKey}`;
  if (fee > 0) {
    await transfer({
      fromAccountId: account.id,
      toAccountId: platform.id,
      amountCents: fee,
      kind: "FEE_CARD",
      description: `Kosten ${type === "physical" ? "fysieke" : "virtuele"} betaalpas`,
      toDescription: `Paskosten ${account.holderName}`,
      fromCounterparty: "ZekerFlex B.V.",
      toCounterparty: account.holderName,
      idempotencyKey: feeKey,
    });
  }

  try {
    const stripe = getStripeClient();
    const cardholder = await ensureCardholder(account, details, input.email);
    const card = await stripe.issuing.cards.create(
      {
        cardholder,
        currency: "eur",
        type,
        status: type === "virtual" ? "active" : "inactive",
        ...(type === "physical"
          ? {
              shipping: {
                name: `${details.firstName} ${details.lastName}`.slice(0, 40),
                address: { line1: details.line1, postal_code: details.postalCode, city: details.city, country: details.country },
                service: "standard",
              },
            }
          : {}),
        metadata: { bankAccountId: account.id },
      },
      { idempotencyKey: `zf-card:${account.id}:${input.requestKey}` },
    );
    return await prisma.bankCard.upsert({
      where: { stripeCardId: card.id },
      update: {},
      create: {
        accountId: account.id,
        stripeCardId: card.id,
        stripeCardholderId: cardholder,
        type,
        brand: card.brand,
        last4: card.last4,
        expMonth: card.exp_month,
        expYear: card.exp_year,
        status: card.status,
      },
    });
  } catch (err) {
    if (fee > 0) {
      await transfer({
        fromAccountId: platform.id,
        toAccountId: account.id,
        amountCents: fee,
        kind: "FEE_CARD",
        description: `Paskosten teruggestort ${account.holderName}`,
        toDescription: "Paskosten teruggestort — pas kon niet worden aangemaakt",
        idempotencyKey: `${feeKey}:refund`,
        allowFrozen: true,
      }).catch((e) => logger.error("card fee refund failed", { accountId: account.id, error: (e as Error).message }));
    }
    const message = (err as { message?: string }).message ?? "onbekende fout";
    logger.warn("issuing card creation failed", { accountId: account.id, error: message });
    throw AppError.upstream(`Stripe kon de pas niet aanmaken: ${message}`);
  }
}

/** Freeze (inactive), unfreeze (active) or cancel a card — mirrored to Stripe. */
export async function setCardStatus(cardId: string, accountId: string, status: "active" | "inactive" | "canceled"): Promise<BankCard> {
  const card = await prisma.bankCard.findFirst({ where: { id: cardId, accountId } });
  if (!card) throw AppError.notFound("Pas niet gevonden");
  if (card.status === "canceled") throw AppError.precondition("Deze pas is al opgezegd");
  await getStripeClient().issuing.cards.update(card.stripeCardId, { status });
  return prisma.bankCard.update({ where: { id: card.id }, data: { status } });
}

/** Ephemeral key for Stripe Issuing Elements, so the full card number is shown by Stripe, never by us. */
export async function cardDetailsKey(cardId: string, accountId: string, nonce: string): Promise<{ stripeCardId: string; secret: string }> {
  const card = await prisma.bankCard.findFirst({ where: { id: cardId, accountId } });
  if (!card) throw AppError.notFound("Pas niet gevonden");
  const stripe = getStripeClient();
  const key = await stripe.ephemeralKeys.create({ issuing_card: card.stripeCardId, nonce }, { apiVersion: stripe.getApiField("version") as string });
  if (!key.secret) throw AppError.upstream("Stripe gaf geen sleutel terug");
  return { stripeCardId: card.stripeCardId, secret: key.secret };
}

// ---- real-time authorization + settlement (called from the Stripe webhook) ----

async function accountForStripeCard(stripeCardId: string): Promise<{ card: BankCard; account: BankAccount } | null> {
  const card = await prisma.bankCard.findUnique({ where: { stripeCardId } });
  if (!card) return null;
  const account = await prisma.bankAccount.findUnique({ where: { id: card.accountId } });
  return account ? { card, account } : null;
}

/** Decides an issuing_authorization.request. Returns whether to approve. */
export async function decideAuthorization(auth: Stripe.Issuing.Authorization): Promise<{ approved: boolean; reason: string }> {
  const amount = auth.pending_request?.amount ?? 0;
  const found = await accountForStripeCard(auth.card.id);
  if (!found) return { approved: false, reason: "unknown_card" };
  const { card, account } = found;
  if (card.status !== "active") return { approved: false, reason: "card_inactive" };
  if (account.frozenAt) return { approved: false, reason: "account_frozen" };
  if (amount <= 0) return { approved: true, reason: "zero_amount" };
  const merchant = auth.merchant_data?.name ?? "Kaartbetaling";
  try {
    await book(account.id, {
      amountCents: -amount,
      kind: "CARD_SPEND",
      description: `Pas …${card.last4}: ${merchant}`,
      counterparty: merchant,
      reference: auth.id,
      // An incremental authorization is a second request on the same id.
      idempotencyKey: `card-auth:${auth.id}:${auth.request_history.length}`,
    });
  } catch {
    return { approved: false, reason: "insufficient_funds" };
  }
  const hold = (await kvGet<Hold>(holdKey(auth.id))) ?? { accountId: account.id, heldCents: 0 };
  await kvSet(holdKey(auth.id), { ...hold, heldCents: hold.heldCents + amount });
  return { approved: true, reason: "ok" };
}

/** issuing_transaction.created: settle a capture against its hold, or credit a refund. */
export async function settleTransaction(tx: Stripe.Issuing.Transaction): Promise<void> {
  const cardId = typeof tx.card === "string" ? tx.card : tx.card.id;
  const found = await accountForStripeCard(cardId);
  if (!found) return;
  const { card, account } = found;
  const merchant = tx.merchant_data?.name ?? "Kaartbetaling";
  // Stripe: negative = money leaving (capture), positive = refund.
  if (tx.amount > 0) {
    await book(account.id, { amountCents: tx.amount, kind: "CARD_REFUND", description: `Terugbetaling pas …${card.last4}: ${merchant}`, counterparty: merchant, reference: tx.id, idempotencyKey: `card-tx:${tx.id}` }, { allowFrozen: true });
    return;
  }
  const captured = -tx.amount;
  if (captured === 0) return;
  const authId = typeof tx.authorization === "string" ? tx.authorization : tx.authorization?.id;
  const hold = authId ? await kvGet<Hold>(holdKey(authId)) : null;
  const fromHold = Math.min(hold?.heldCents ?? 0, captured);
  const extra = captured - fromHold;
  if (extra > 0) {
    await book(
      account.id,
      { amountCents: -extra, kind: "CARD_SPEND", description: `Pas …${card.last4}: ${merchant} (nabetaling)`, counterparty: merchant, reference: tx.id, idempotencyKey: `card-tx:${tx.id}` },
      { allowFrozen: true, allowNegative: true },
    );
  }
  if (hold && authId && fromHold > 0) await kvSet(holdKey(authId), { ...hold, heldCents: hold.heldCents - fromHold });
}

/** issuing_authorization.updated: release what's left of the hold once it's closed/reversed. */
export async function releaseHold(auth: Stripe.Issuing.Authorization): Promise<void> {
  if (auth.status !== "closed" && auth.status !== "reversed") return;
  const hold = await kvGet<Hold>(holdKey(auth.id));
  if (!hold || hold.heldCents <= 0) return;
  await book(
    hold.accountId,
    { amountCents: hold.heldCents, kind: "CARD_REFUND", description: `Reservering vrijgegeven: ${auth.merchant_data?.name ?? "kaartbetaling"}`, reference: auth.id, idempotencyKey: `card-release:${auth.id}` },
    { allowFrozen: true },
  );
  await kvSet(holdKey(auth.id), { ...hold, heldCents: 0 });
}

/** issuing_card.updated: keep the local status in step (shipped card activated, Stripe-side cancel …). */
export async function syncCard(card: Stripe.Issuing.Card): Promise<void> {
  await prisma.bankCard.updateMany({ where: { stripeCardId: card.id }, data: { status: card.status } });
}
