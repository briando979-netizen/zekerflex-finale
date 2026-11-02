import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { alertOwner } from "@/lib/ops/alert";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { MAIL_PRESETS } from "@/lib/mail/presets";
import { getMailboxConnection, saveMailboxConnection, deleteMailboxConnection, sealMailboxPassword } from "@/lib/mail/mailbox-connection";
import { createMailbox, listMailboxes, listMailForwards, transipConfigured } from "@/lib/mail/hosting/transip";
import {
  ZF_MAIL_DOMAIN,
  ZF_MAILBOX_QUOTA_MB,
  displayNameProblem,
  localPartProblem,
  normalizeLocalPart,
  passwordProblem,
} from "@/lib/mail/zf-address";

// ---------------------------------------------------------------------------
// ZekerFlex Mail accounts — an employer's own address on zekerflex.com.
//   key "zfmail:account:<address>" — the account (claimed atomically: the
//                                    first create wins, a second gets 409)
//   key "zfmail:user:<userId>"     — which address belongs to a user
// With the TransIP key set the mailbox is made at once and connected to the
// user's mail page; without it the request waits ("aangevraagd") with the
// password sealed, and an admin activates it once the key is there.
// ---------------------------------------------------------------------------

export type ZfMailStatus = "aangevraagd" | "actief" | "geblokkeerd";

export interface ZfMailAccount {
  address: string;
  localPart: string;
  userId: string;
  tenantId: string | null;
  displayName: string;
  status: ZfMailStatus;
  /** sealed password, only while the request waits for the TransIP key */
  pendingPasswordSealed?: string;
  recoveryEmail: string | null;
  createdAt: string;
  activatedAt: string | null;
  history: { at: string; what: string; by: string }[];
}

const PENDING_PURPOSE = "zfmail-pending-password";
const accountKey = (address: string) => `zfmail:account:${address}`;
const userKey = (userId: string) => `zfmail:user:${userId}`;
const isReservedTestEmail = (email: string) => /\.(test|example|invalid|localhost)$/i.test(email.trim());

/** What the browser may see — never the (sealed) password. */
export function publicAccount(a: ZfMailAccount) {
  return {
    address: a.address,
    displayName: a.displayName,
    status: a.status,
    createdAt: a.createdAt,
    activatedAt: a.activatedAt,
    recoveryEmail: a.recoveryEmail,
  };
}

export async function accountOfUser(userId: string): Promise<ZfMailAccount | null> {
  const address = await kvGet<string>(userKey(userId));
  return address ? kvGet<ZfMailAccount>(accountKey(address)) : null;
}

let hostCache: { at: number; taken: Set<string> } | null = null;

/** Tests only: forget the cached TransIP address list. */
export function _resetZfMailCache(): void {
  hostCache = null;
}

/** Local parts already in use at TransIP (mailboxes and forwards, e.g. the owner's info@). */
async function takenAtHost(): Promise<Set<string>> {
  if (!transipConfigured()) return new Set();
  if (hostCache && Date.now() - hostCache.at < 60_000) return hostCache.taken;
  const [boxes, forwards] = await Promise.all([listMailboxes(ZF_MAIL_DOMAIN), listMailForwards(ZF_MAIL_DOMAIN)]);
  const taken = new Set([...boxes.map((b) => b.localPart.toLowerCase()), ...forwards.map((f) => f.localPart.toLowerCase())]);
  hostCache = { at: Date.now(), taken };
  return taken;
}

export interface AddressCheck {
  localPart: string;
  address: string;
  available: boolean;
  reason: string | null;
}

export async function checkAddress(raw: string): Promise<AddressCheck> {
  const localPart = normalizeLocalPart(raw);
  const address = `${localPart}@${ZF_MAIL_DOMAIN}`;
  const problem = localPartProblem(localPart);
  if (problem) return { localPart, address, available: false, reason: problem };
  if ((await kvGet(accountKey(address))) || (await takenAtHost()).has(localPart)) {
    return { localPart, address, available: false, reason: "Dit adres is al in gebruik." };
  }
  return { localPart, address, available: true, reason: null };
}

export const createSchema = z.object({
  localPart: z.string().trim().min(1).max(64),
  displayName: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
  recoveryEmail: z.string().trim().toLowerCase().email().max(254).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Ga akkoord met de gebruiksregels." }) }),
});

export interface Creator {
  userId: string;
  email: string;
  fullName: string;
  tenantId: string | null;
}

/** Store the TransIP mailbox as the user's connected mailbox, so the mail page works at once. */
async function connectForUser(a: ZfMailAccount, password: string): Promise<void> {
  const transip = MAIL_PRESETS.find((p) => p.id === "transip")!;
  await saveMailboxConnection({
    userId: a.userId,
    email: a.address,
    displayName: a.displayName,
    username: a.address,
    imap: transip.imap,
    smtp: transip.smtp,
    passwordSealed: sealMailboxPassword(password),
    connectedAt: new Date().toISOString(),
  });
}

export async function createAccount(who: Creator, input: z.infer<typeof createSchema>): Promise<ZfMailAccount> {
  if (await accountOfUser(who.userId)) throw AppError.conflict("Je hebt al een ZekerFlex-mailadres.");
  if (await getMailboxConnection(who.userId)) {
    throw AppError.precondition("Er is al een mailbox gekoppeld. Ontkoppel die eerst als je een ZekerFlex-adres wilt.");
  }
  const check = await checkAddress(input.localPart);
  if (!check.available) throw AppError.validation(check.reason ?? "Dit adres kan niet.");
  const nameProblem = displayNameProblem(input.displayName);
  if (nameProblem) throw AppError.validation(nameProblem);
  const pwProblem = passwordProblem(input.password, { localPart: check.localPart, name: input.displayName });
  if (pwProblem) throw AppError.validation(pwProblem);

  const now = new Date().toISOString();
  const live = transipConfigured();
  const account: ZfMailAccount = {
    address: check.address,
    localPart: check.localPart,
    userId: who.userId,
    tenantId: who.tenantId,
    displayName: input.displayName,
    status: "aangevraagd",
    ...(live ? {} : { pendingPasswordSealed: sealSecret(input.password, PENDING_PURPOSE) }),
    recoveryEmail: input.recoveryEmail ?? who.email,
    createdAt: now,
    activatedAt: null,
    history: [{ at: now, what: "aangevraagd", by: who.fullName }],
  };

  // Claim the address in one step: a unique key, so two people can never both get it.
  try {
    await prisma.keyValueStore.create({ data: { key: accountKey(account.address), value: account as unknown as Prisma.InputJsonValue } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw AppError.conflict("Dit adres is net door iemand anders gekozen.");
    throw err;
  }
  await kvSet(userKey(who.userId), account.address);

  if (live) {
    try {
      await createMailbox(ZF_MAIL_DOMAIN, { localPart: account.localPart, password: input.password, maxDiskUsage: ZF_MAILBOX_QUOTA_MB });
    } catch (err) {
      // nothing was made at TransIP: free the address again
      await kvDelete(accountKey(account.address));
      await kvDelete(userKey(who.userId));
      throw err;
    }
    hostCache = null;
    account.status = "actief";
    account.activatedAt = new Date().toISOString();
    account.history.push({ at: account.activatedAt, what: "actief", by: "TransIP" });
    await kvSet(accountKey(account.address), account);
    await connectForUser(account, input.password);
  } else if (!isReservedTestEmail(who.email)) {
    await alertOwner({
      key: "zfmail:new",
      severity: "warning",
      title: "Nieuw ZekerFlex-mailadres aangevraagd",
      detail: `${account.displayName} wil ${account.address}. Zet de TransIP-sleutel op de server; daarna activeer je het in Admin → ZekerFlex Mail.`,
      url: "/admin/zekerflex-mail",
    });
  }

  await recordAudit({
    category: "SECURITY",
    action: live ? "zfmail.created" : "zfmail.requested",
    actorUserId: who.userId,
    summary: `ZekerFlex-mailadres ${account.address} ${live ? "aangemaakt" : "aangevraagd"}`,
    targetType: "zfmail",
    targetId: account.address,
  });
  return account;
}

export async function listAccounts(): Promise<ZfMailAccount[]> {
  const all = await kvListValues<ZfMailAccount>("zfmail:account:", 5000);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const adminActionSchema = z.object({
  action: z.enum(["activeer", "blokkeer", "deblokkeer"]),
  address: z.string().trim().toLowerCase().email(),
  note: z.string().trim().max(300).optional(),
});

/** Admin: make a waiting request real (needs the TransIP key), or block/unblock an address. */
export async function adminAction(input: z.infer<typeof adminActionSchema>, admin: { userId: string; name: string }): Promise<ZfMailAccount> {
  const account = await kvGet<ZfMailAccount>(accountKey(input.address));
  if (!account) throw AppError.notFound("Dit adres bestaat niet.");
  const now = new Date().toISOString();

  if (input.action === "activeer") {
    if (account.status !== "aangevraagd" || !account.pendingPasswordSealed) throw AppError.precondition("Dit adres wacht niet op activering.");
    if (!transipConfigured()) throw AppError.precondition("Zet eerst de TransIP-sleutel op de server (Admin → Te doen).");
    const password = openSecret(account.pendingPasswordSealed, PENDING_PURPOSE);
    await createMailbox(ZF_MAIL_DOMAIN, { localPart: account.localPart, password, maxDiskUsage: ZF_MAILBOX_QUOTA_MB });
    hostCache = null;
    delete account.pendingPasswordSealed;
    account.status = "actief";
    account.activatedAt = now;
    if (!(await getMailboxConnection(account.userId))) await connectForUser(account, password);
  } else if (input.action === "blokkeer") {
    account.status = "geblokkeerd";
    const conn = await getMailboxConnection(account.userId);
    if (conn?.email === account.address) await deleteMailboxConnection(account.userId);
  } else {
    if (account.status !== "geblokkeerd") throw AppError.precondition("Dit adres is niet geblokkeerd.");
    account.status = account.activatedAt ? "actief" : "aangevraagd";
  }

  account.history.push({ at: now, what: input.note ? `${input.action}: ${input.note}` : input.action, by: admin.name });
  await kvSet(accountKey(account.address), account);
  await recordAudit({
    category: "SECURITY",
    action: `zfmail.${input.action}`,
    actorUserId: admin.userId,
    summary: `ZekerFlex-mailadres ${account.address}: ${input.action}`,
    targetType: "zfmail",
    targetId: account.address,
  });
  return account;
}
