import type { BankAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { sendUserPush } from "@/lib/notifications/push";

// ---------------------------------------------------------------------------
// ZekerFlex Bank notifications: push to the holder's devices (company
// account → its HQ admins) plus a short in-app list for the notification
// bell. Each kind can be switched off per account; low balance has its own
// threshold and fires at most once a day. Always best effort: a failed push
// never affects the money movement that triggered it.
//   key "bank-notify:<accountId>"  → NotifyPrefs
//   key "bank-notes:<accountId>"   → BankNote[] (latest 30)
//   key "bank-low:<accountId>:<YYYY-MM-DD>" → sent marker
// ---------------------------------------------------------------------------

export type NoteKind = "incoming" | "card" | "lowBalance" | "standing" | "security";

export interface NotifyPrefs {
  incoming: boolean;
  card: boolean;
  standing: boolean;
  /** 0 = off */
  lowBalanceCents: number;
}
export interface BankNote {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  at: string;
}

export const DEFAULT_PREFS: NotifyPrefs = { incoming: true, card: true, standing: true, lowBalanceCents: 2_000 };

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);

export async function getNotifyPrefs(accountId: string): Promise<NotifyPrefs> {
  return { ...DEFAULT_PREFS, ...((await kvGet<Partial<NotifyPrefs>>(`bank-notify:${accountId}`)) ?? {}) };
}

export async function setNotifyPrefs(accountId: string, prefs: NotifyPrefs): Promise<NotifyPrefs> {
  await kvSet(`bank-notify:${accountId}`, prefs);
  return prefs;
}

export async function recentNotes(accountId: string): Promise<BankNote[]> {
  return (await kvGet<BankNote[]>(`bank-notes:${accountId}`)) ?? [];
}

async function recipients(account: Pick<BankAccount, "userId" | "tenantId">): Promise<string[]> {
  if (account.userId) return [account.userId];
  if (account.tenantId) {
    const admins = await prisma.membership.findMany({ where: { tenantId: account.tenantId, role: "HQ_ADMIN" }, select: { userId: true } });
    return admins.map((a) => a.userId);
  }
  return [];
}

function urlFor(account: Pick<BankAccount, "userId" | "tenantId">) {
  return account.tenantId ? "/werkgever/bank" : "/dashboard/bank";
}

/** Sends one bank notification (if the holder wants this kind). Never throws. */
export async function notifyBank(accountOrId: BankAccount | string, kind: NoteKind, title: string, body: string): Promise<void> {
  try {
    const account = typeof accountOrId === "string" ? await prisma.bankAccount.findUnique({ where: { id: accountOrId } }) : accountOrId;
    if (!account || account.ownerType === "PLATFORM") return;
    const prefs = await getNotifyPrefs(account.id);
    if ((kind === "incoming" && !prefs.incoming) || (kind === "card" && !prefs.card) || (kind === "standing" && !prefs.standing)) return;
    const note: BankNote = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind, title, body, at: new Date().toISOString() };
    await kvSet(`bank-notes:${account.id}`, [note, ...(await recentNotes(account.id))].slice(0, 30));
    await sendUserPush(await recipients(account), { title, body, data: { type: "bank", url: urlFor(account), tag: `bank-${kind}` }, ttlSeconds: kind === "card" ? 600 : 86_400 });
  } catch (err) {
    logger.warn("bank notification failed", { kind, error: (err as Error).message });
  }
}

/** Money came in. */
export async function notifyIncoming(accountId: string, amountCents: number, from: string): Promise<void> {
  await notifyBank(accountId, "incoming", `+${euro(amountCents)} ontvangen`, `Van ${from} op je ZekerFlex Bank.`);
}

/** After money went out: warn once a day when the balance drops below the threshold. */
export async function checkLowBalance(accountId: string): Promise<void> {
  try {
    const account = await prisma.bankAccount.findUnique({ where: { id: accountId } });
    if (!account || account.ownerType === "PLATFORM") return;
    const { lowBalanceCents } = await getNotifyPrefs(account.id);
    if (!lowBalanceCents || account.balanceCents >= lowBalanceCents) return;
    const marker = `bank-low:${account.id}:${new Date().toISOString().slice(0, 10)}`;
    if (await kvGet(marker)) return;
    await kvSet(marker, true);
    await notifyBank(account, "lowBalance", "Je saldo is laag", `Nog ${euro(account.balanceCents)} op je ZekerFlex Bank. Vul aan om pasbetalingen niet te laten weigeren.`);
  } catch (err) {
    logger.warn("low balance check failed", { accountId, error: (err as Error).message });
  }
}
