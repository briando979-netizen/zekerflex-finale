import type { BankPot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { platformAccount } from "@/lib/bank/accounts";
import { bookWith, transfer } from "@/lib/bank/ledger";

// ---------------------------------------------------------------------------
// Pots ("potjes") and fixed-term deposits inside a ZekerFlex Bank account.
// Moving money into a pot is a POT_IN entry on the main balance plus the pot
// balance going up, in one transaction; out is the reverse. A FIXED pot gets
// one deposit at opening, is locked until lockedUntil and pays simple
// interest at maturity (from the platform account), after which the money
// returns to the main balance and the pot closes.
//   key "bank-savings-rates" → { [termYears]: interestBps per year }
// ---------------------------------------------------------------------------

export type SavingsRates = Record<string, number>;
export const DEFAULT_RATES: SavingsRates = { "1": 150, "2": 175, "3": 200, "5": 250, "10": 300 };
const RATES_KEY = "bank-savings-rates";
const MAX_POTS = 20;

export async function getSavingsRates(): Promise<SavingsRates> {
  return (await kvGet<SavingsRates>(RATES_KEY)) ?? DEFAULT_RATES;
}

export async function setSavingsRates(rates: SavingsRates): Promise<SavingsRates> {
  await kvSet(RATES_KEY, rates);
  return rates;
}

/** Simple interest over the whole term, in cents. */
export function interestFor(balanceCents: number, bpsPerYear: number, years: number): number {
  return Math.round((balanceCents * bpsPerYear * years) / 10_000);
}

export async function listPots(accountId: string): Promise<BankPot[]> {
  return prisma.bankPot.findMany({ where: { accountId, closedAt: null }, orderBy: { createdAt: "asc" } });
}

async function assertRoom(accountId: string) {
  if ((await prisma.bankPot.count({ where: { accountId, closedAt: null } })) >= MAX_POTS) {
    throw AppError.precondition(`Maximaal ${MAX_POTS} potjes`);
  }
}

export async function createPot(input: { accountId: string; name: string; emoji: string; targetCents: number | null }): Promise<BankPot> {
  await assertRoom(input.accountId);
  return prisma.bankPot.create({
    data: { accountId: input.accountId, name: input.name.slice(0, 40), emoji: input.emoji.slice(0, 8) || "🎯", kind: "POT", targetCents: input.targetCents },
  });
}

async function ownPot(potId: string, accountId: string): Promise<BankPot> {
  const pot = await prisma.bankPot.findFirst({ where: { id: potId, accountId, closedAt: null } });
  if (!pot) throw AppError.notFound("Potje niet gevonden");
  return pot;
}

/** Opens a deposit and moves the amount in, atomically. */
export async function openDeposit(input: { accountId: string; amountCents: number; termYears: number; requestKey: string }): Promise<BankPot> {
  const rates = await getSavingsRates();
  const bps = rates[String(input.termYears)];
  if (bps === undefined) throw AppError.validation("Deze looptijd bestaat niet");
  if (input.amountCents < 10_000) throw AppError.validation("Vastzetten kan vanaf € 100");
  await assertRoom(input.accountId);
  const lockedUntil = new Date();
  lockedUntil.setUTCFullYear(lockedUntil.getUTCFullYear() + input.termYears);
  const opened: { pot: BankPot | null } = { pot: null };
  await bookWith(
    input.accountId,
    {
      amountCents: -input.amountCents,
      kind: "POT_IN",
      description: `Vastgezet voor ${input.termYears} jaar (${(bps / 100).toFixed(2).replace(".", ",")}% per jaar)`,
      idempotencyKey: `deposit:${input.accountId}:${input.requestKey}`,
    },
    async (tx) => {
      opened.pot = await tx.bankPot.create({
        data: {
          accountId: input.accountId,
          name: `Deposito ${input.termYears} jaar`,
          emoji: "🔒",
          kind: "FIXED",
          balanceCents: input.amountCents,
          termYears: input.termYears,
          interestBps: bps,
          lockedUntil,
        },
      });
    },
  );
  if (!opened.pot) throw AppError.conflict("Deze deposito is al geopend");
  return opened.pot;
}

/** Moves money between the main balance and a pot. */
export async function movePot(input: { potId: string; accountId: string; direction: "in" | "out"; amountCents: number; requestKey: string }): Promise<void> {
  const pot = await ownPot(input.potId, input.accountId);
  if (input.amountCents <= 0) throw AppError.validation("Ongeldig bedrag");
  if (pot.kind === "FIXED") {
    if (input.direction === "in") throw AppError.precondition("Bij een deposito kun je niet bijstorten — open een nieuwe");
    throw AppError.precondition(`Vastgezet tot ${pot.lockedUntil?.toLocaleDateString("nl-NL")} — eerder opnemen kan niet`);
  }
  const key = `pot-${input.direction}:${pot.id}:${input.requestKey}`;
  if (input.direction === "in") {
    await bookWith(input.accountId, { amountCents: -input.amountCents, kind: "POT_IN", description: `Naar potje ${pot.emoji} ${pot.name}`, idempotencyKey: key }, async (tx) => {
      await tx.bankPot.update({ where: { id: pot.id }, data: { balanceCents: { increment: input.amountCents } } });
    });
    return;
  }
  // Out: take it from the pot first (conditional, so the pot never goes negative).
  await bookWith(
    input.accountId,
    { amountCents: input.amountCents, kind: "POT_OUT", description: `Uit potje ${pot.emoji} ${pot.name}`, idempotencyKey: key },
    async (tx) => {
      const taken = await tx.bankPot.updateMany({ where: { id: pot.id, balanceCents: { gte: input.amountCents } }, data: { balanceCents: { decrement: input.amountCents } } });
      if (taken.count === 0) throw AppError.precondition("Er staat niet zoveel in dit potje");
    },
    { allowFrozen: true },
  );
}

/** Removes an empty pot (or empties it into the main balance first). */
export async function closePot(potId: string, accountId: string): Promise<void> {
  const pot = await ownPot(potId, accountId);
  if (pot.kind === "FIXED" && pot.lockedUntil && pot.lockedUntil > new Date()) throw AppError.precondition("Een deposito sluit vanzelf op de einddatum");
  if (pot.balanceCents > 0) await movePot({ potId, accountId, direction: "out", amountCents: pot.balanceCents, requestKey: "close" });
  await prisma.bankPot.update({ where: { id: pot.id }, data: { closedAt: new Date() } });
}

/** Daily: pay interest on matured deposits and return the money to the main balance. */
export async function matureDeposits(now = new Date()): Promise<{ matured: number }> {
  const due = await prisma.bankPot.findMany({ where: { kind: "FIXED", closedAt: null, lockedUntil: { lte: now } }, include: { account: true }, take: 500 });
  if (due.length === 0) return { matured: 0 };
  const platform = await platformAccount();
  let matured = 0;
  for (const pot of due) {
    try {
      const interest = interestFor(pot.balanceCents, pot.interestBps, pot.termYears ?? 0);
      if (interest > 0) {
        await transfer({
          fromAccountId: platform.id,
          toAccountId: pot.accountId,
          amountCents: interest,
          kind: "INTEREST",
          description: `Rente deposito ${pot.account.holderName}`,
          toDescription: `Rente ${pot.name} (${(pot.interestBps / 100).toFixed(2).replace(".", ",")}% per jaar)`,
          fromCounterparty: pot.account.holderName,
          toCounterparty: "ZekerFlex B.V.",
          idempotencyKey: `interest:${pot.id}`,
          allowNegative: true,
          allowFrozen: true,
        });
      }
      await bookWith(
        pot.accountId,
        { amountCents: pot.balanceCents, kind: "POT_OUT", description: `${pot.name} afgelopen — terug op je rekening`, idempotencyKey: `deposit-mature:${pot.id}` },
        async (tx) => {
          await tx.bankPot.update({ where: { id: pot.id }, data: { balanceCents: 0, closedAt: now } });
        },
        { allowFrozen: true },
      );
      matured++;
    } catch (err) {
      logger.error("deposit maturity failed", { potId: pot.id, error: (err as Error).message });
    }
  }
  return { matured };
}
