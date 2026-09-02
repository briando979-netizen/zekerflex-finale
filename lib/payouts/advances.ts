import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Voorschot (advance against the next payout). 3% fee on the advanced amount,
// settled against the freelancer's next payment. Filesystem, advisory —
// no Payment / Invoice rows are touched.
//   storage/payouts/advances/<userId>.jsonl
// ---------------------------------------------------------------------------

export type AdvanceStatus = "requested" | "approved" | "settled" | "rejected";

export interface Advance {
  id: string;
  userId: string;
  amountCents: number; // gross advance requested
  feeCents: number; // 3% platform fee
  netCents: number; // amount - fee, paid out now
  requestedAt: string;
  status: AdvanceStatus;
  settledAt?: string;
  note?: string;
}

const dir = () => join(process.cwd(), "storage", "payouts", "advances");
const file = (userId: string) => join(dir(), `${userId.replace(/[^a-z0-9-]/gi, "")}.jsonl`);

export async function listAdvances(userId: string): Promise<Advance[]> {
  const p = file(userId);
  if (!existsSync(p)) return [];
  const lines = (await readFile(p, "utf8")).split("\n").filter(Boolean);
  const out: Advance[] = [];
  for (const l of lines) {
    try {
      out.push(JSON.parse(l) as Advance);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
}

/** Total advanced amount not yet settled (deducted from the next payout). */
export async function outstandingAdvanceCents(userId: string): Promise<number> {
  const all = await listAdvances(userId);
  return all
    .filter((a) => a.status === "requested" || a.status === "approved")
    .reduce((s, a) => s + a.amountCents, 0);
}

export function advanceFee(amountCents: number): number {
  return Math.round(amountCents * env.ADVANCE_FEE_RATE);
}

export function maxAdvanceCents(pendingPayoutCents: number, alreadyOutstandingCents: number): number {
  return Math.max(0, Math.round(pendingPayoutCents * env.ADVANCE_MAX_RATE_OF_PENDING) - alreadyOutstandingCents);
}

export async function requestAdvance(
  userId: string,
  amountCents: number,
  pendingPayoutCents: number,
): Promise<Advance> {
  const amount = Math.round(amountCents);
  if (amount < 500) throw new Error("Minimaal € 5,00");
  const outstanding = await outstandingAdvanceCents(userId);
  const cap = maxAdvanceCents(pendingPayoutCents, outstanding);
  if (amount > cap) {
    throw new Error(
      `Maximaal € ${(cap / 100).toFixed(2).replace(".", ",")} beschikbaar als voorschot (${Math.round(
        env.ADVANCE_MAX_RATE_OF_PENDING * 100,
      )}% van je openstaande bedrag, minus lopende voorschotten).`,
    );
  }
  const fee = advanceFee(amount);
  const advance: Advance = {
    id: randomUUID().slice(0, 12),
    userId,
    amountCents: amount,
    feeCents: fee,
    netCents: amount - fee,
    requestedAt: new Date().toISOString(),
    status: "requested",
  };
  await mkdir(dir(), { recursive: true });
  await appendFile(file(userId), JSON.stringify(advance) + "\n", "utf8");
  return advance;
}

/** Mark advances settled once the next payout has cleared (admin / cron use). */
export async function settleAdvances(userId: string): Promise<void> {
  const all = await listAdvances(userId);
  const now = new Date().toISOString();
  const next = all.map((a) =>
    a.status === "requested" || a.status === "approved" ? { ...a, status: "settled" as const, settledAt: now } : a,
  );
  await mkdir(dir(), { recursive: true });
  await writeFile(file(userId), next.map((a) => JSON.stringify(a)).join("\n") + "\n", "utf8");
}
