import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { findByNumber, sendMoney } from "@/lib/bank/p2p";
import { movePot } from "@/lib/bank/pots";
import { notifyBank } from "@/lib/bank/notify";

// ---------------------------------------------------------------------------
// Vaste opdrachten: a recurring transfer to another ZekerFlex account or into
// one of the holder's own pots, weekly or monthly. Run by the daily bank
// cron; each run has its own idempotency key (order + due date), so a cron
// retry never pays twice. A run that fails (too little balance) is retried
// the next day and the reason is shown to the holder.
//   key "bank-standing:<id>"
// ---------------------------------------------------------------------------

export type Interval = "weekly" | "monthly";

export interface StandingOrder {
  id: string;
  accountId: string;
  target: { kind: "account"; number: string; holderName: string } | { kind: "pot"; potId: string; potName: string };
  amountCents: number;
  description: string;
  interval: Interval;
  nextRunAt: string;
  active: boolean;
  createdAt: string;
  lastRunAt?: string;
  lastError?: string;
}

const key = (id: string) => `bank-standing:${id}`;
const MAX_ORDERS = 20;

function advance(d: Date, interval: Interval): Date {
  const n = new Date(d);
  if (interval === "weekly") n.setUTCDate(n.getUTCDate() + 7);
  else n.setUTCMonth(n.getUTCMonth() + 1);
  return n;
}

export async function listStanding(accountId: string): Promise<StandingOrder[]> {
  return (await kvListValues<StandingOrder>("bank-standing:", 5000)).filter((o) => o.accountId === accountId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function createStanding(input: {
  accountId: string;
  target: { kind: "account"; number: string } | { kind: "pot"; potId: string };
  amountCents: number;
  description: string;
  interval: Interval;
  firstRun: Date;
}): Promise<StandingOrder> {
  if ((await listStanding(input.accountId)).length >= MAX_ORDERS) throw AppError.precondition(`Maximaal ${MAX_ORDERS} vaste opdrachten`);
  let target: StandingOrder["target"];
  if (input.target.kind === "account") {
    const to = await findByNumber(input.target.number);
    if (!to || to.ownerType === "PLATFORM") throw AppError.notFound("Dit ZekerFlex-rekeningnummer bestaat niet");
    if (to.id === input.accountId) throw AppError.validation("Kies een potje om naar jezelf te sparen");
    target = { kind: "account", number: to.number, holderName: to.holderName };
  } else {
    const pot = await prisma.bankPot.findFirst({ where: { id: input.target.potId, accountId: input.accountId, kind: "POT", closedAt: null } });
    if (!pot) throw AppError.notFound("Potje niet gevonden");
    target = { kind: "pot", potId: pot.id, potName: `${pot.emoji} ${pot.name}` };
  }
  const order: StandingOrder = {
    id: randomUUID(),
    accountId: input.accountId,
    target,
    amountCents: input.amountCents,
    description: input.description.trim().slice(0, 140),
    interval: input.interval,
    nextRunAt: input.firstRun.toISOString(),
    active: true,
    createdAt: new Date().toISOString(),
  };
  await kvSet(key(order.id), order);
  return order;
}

export async function updateStanding(id: string, accountId: string, patch: { active?: boolean; delete?: boolean }): Promise<void> {
  const o = await kvGet<StandingOrder>(key(id));
  if (!o || o.accountId !== accountId) throw AppError.notFound("Opdracht niet gevonden");
  // Deleting = permanently inactive (kept for the history, hidden in the UI).
  await kvSet(key(id), { ...o, active: patch.delete ? false : (patch.active ?? o.active), ...(patch.delete ? { nextRunAt: "9999-12-31T00:00:00.000Z", lastError: "verwijderd" } : {}) });
}

/** Daily: run every due, active order. */
export async function runStandingOrders(now = new Date()): Promise<{ ran: number; failed: number }> {
  const due = (await kvListValues<StandingOrder>("bank-standing:", 10_000)).filter((o) => o.active && new Date(o.nextRunAt) <= now);
  let ran = 0;
  let failed = 0;
  for (const o of due) {
    const runKey = `standing-${o.id.slice(0, 8)}-${o.nextRunAt.slice(0, 10)}`;
    try {
      const account = await prisma.bankAccount.findUnique({ where: { id: o.accountId } });
      if (!account) throw new Error("rekening bestaat niet meer");
      if (account.frozenAt) throw new Error("rekening geblokkeerd");
      if (o.target.kind === "account") {
        await sendMoney({ from: account, toNumber: o.target.number, amountCents: o.amountCents, description: o.description || "Vaste opdracht", requestKey: runKey });
      } else {
        await movePot({ potId: o.target.potId, accountId: o.accountId, direction: "in", amountCents: o.amountCents, requestKey: runKey });
      }
      const next = advance(new Date(o.nextRunAt), o.interval);
      const { lastError: _cleared, ...rest } = o;
      void _cleared;
      await kvSet(key(o.id), { ...rest, nextRunAt: next.toISOString(), lastRunAt: now.toISOString() } satisfies StandingOrder);
      ran++;
    } catch (err) {
      failed++;
      const reason = (err as Error).message.slice(0, 140);
      await kvSet(key(o.id), { ...o, lastError: reason } satisfies StandingOrder);
      // Tell the holder once per failure streak, not every daily retry.
      if (!o.lastError) {
        const to = o.target.kind === "account" ? o.target.holderName : o.target.potName;
        await notifyBank(o.accountId, "standing", "Vaste opdracht niet uitgevoerd", `${(o.amountCents / 100).toFixed(2).replace(".", ",")} naar ${to}: ${reason}. We proberen het morgen opnieuw.`);
      }
      logger.info("standing order not run yet", { orderId: o.id, reason });
    }
  }
  return { ran, failed };
}
