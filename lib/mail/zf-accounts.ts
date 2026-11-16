import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { alertOwner } from "@/lib/ops/alert";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { MAIL_PRESETS } from "@/lib/mail/presets";
import { mailButton, mailShell, sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import { getMailboxConnection, saveMailboxConnection, deleteMailboxConnection, sealMailboxPassword } from "@/lib/mail/mailbox-connection";
import { addDnsEntry, createMailbox, listMailboxes, listMailForwards, transipConfigured } from "@/lib/mail/hosting/transip";
import { TRANSIP_MAIL_DNS } from "@/lib/mail/hosting/transip-mail-dns";
import { featureEnabled } from "@/lib/flags";
import {
  ZF_MAIL_DOMAIN,
  ZF_MAILBOX_QUOTA_MB,
  displayNameProblem,
  eigenLocalPartProblem,
  localPartProblem,
  normalizeLocalPart,
  passwordProblem,
} from "@/lib/mail/zf-address";

// ---------------------------------------------------------------------------
// ZekerFlex Mail accounts — an employer's own address on zekerflex.com, or (16 nov 2026) on the company's own domain
// (info@jouwzaak.nl) when that domain is in ZekerFlex's TransIP account (bought or moved via /domeinnaam).
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
  /** het domein van het adres; ontbreekt = zekerflex.com (de oorspronkelijke ZekerFlex Mail) */
  domain?: string;
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
  /** een eigen domein van het bedrijf (eigenMailDomeinen); leeg = zekerflex.com */
  domein: z.string().trim().toLowerCase().max(253).optional(),
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

/**
 * De eigen domeinen van een bedrijf waarop een mailadres kan: via ZekerFlex gekocht of verhuisd en vastgelegd (GEREGISTREERD),
 * dus in het TransIP-account van ZekerFlex. Een domein dat elders staat kan (nog) niet: TransIP maakt alleen mailboxen op
 * domeinen in het eigen account; verhuizen kan via /domeinnaam.
 */
export async function eigenMailDomeinen(tenantId: string | null): Promise<string[]> {
  if (!tenantId) return [];
  const rijen = await prisma.domeinBestelling.findMany({ where: { tenantId, status: "GEREGISTREERD" }, select: { domein: true }, orderBy: { createdAt: "asc" } });
  return [...new Set(rijen.map((r) => r.domein.toLowerCase()))].filter((d) => d !== ZF_MAIL_DOMAIN);
}

/** Is dit adres op een eigen domein nog vrij (alleen de vorm en onze eigen lijst; TransIP zegt het bij het maken)? */
export async function checkEigenAdres(raw: string, domein: string): Promise<AddressCheck> {
  const localPart = normalizeLocalPart(raw);
  const address = `${localPart}@${domein}`;
  const problem = eigenLocalPartProblem(localPart);
  if (problem) return { localPart, address, available: false, reason: problem };
  if (await kvGet(accountKey(address))) return { localPart, address, available: false, reason: "Dit adres is al in gebruik." };
  return { localPart, address, available: true, reason: null };
}

/** Vlag: een mailbox op een klantdomein meteen maken (aan na de kostencheck van de eigenaar); uit = wachten op Admin. */
export const ZAKELIJKE_MAIL_AUTO = "zakelijke-mail-auto";

/**
 * De mailbox echt maken bij TransIP. Op een eigen domein eerst de mailregels (MX, SPF, DKIM, DMARC; idempotent), anders komt
 * er geen mail binnen.
 */
async function maakMailbox(a: ZfMailAccount, password: string): Promise<void> {
  const domein = a.domain ?? ZF_MAIL_DOMAIN;
  if (domein !== ZF_MAIL_DOMAIN) for (const r of TRANSIP_MAIL_DNS) await addDnsEntry(domein, r);
  await createMailbox(domein, { localPart: a.localPart, password, maxDiskUsage: ZF_MAILBOX_QUOTA_MB });
}

export async function createAccount(who: Creator, input: z.infer<typeof createSchema>): Promise<ZfMailAccount> {
  if (await accountOfUser(who.userId)) throw AppError.conflict("Je hebt al een ZekerFlex-mailadres.");
  if (await getMailboxConnection(who.userId)) {
    throw AppError.precondition("Er is al een mailbox gekoppeld. Ontkoppel die eerst als je een ZekerFlex-adres wilt.");
  }
  // een eigen domein moet van dit bedrijf zijn en in ons TransIP-account staan
  const eigen = input.domein && input.domein !== ZF_MAIL_DOMAIN ? input.domein : null;
  if (eigen && !(await eigenMailDomeinen(who.tenantId)).includes(eigen)) {
    throw AppError.validation("Dit domein staat niet bij je bedrijf. Koop of verhuis het eerst via Domeinnaam.");
  }
  const check = eigen ? await checkEigenAdres(input.localPart, eigen) : await checkAddress(input.localPart);
  if (!check.available) throw AppError.validation(check.reason ?? "Dit adres kan niet.");
  const nameProblem = displayNameProblem(input.displayName);
  if (nameProblem) throw AppError.validation(nameProblem);
  const pwProblem = passwordProblem(input.password, { localPart: check.localPart, name: input.displayName });
  if (pwProblem) throw AppError.validation(pwProblem);

  const now = new Date().toISOString();
  // op een eigen domein alleen meteen als de eigenaar dat aanzette (kosten bij TransIP, 16 nov); anders wacht het op Admin
  const live = transipConfigured() && (!eigen || (await featureEnabled(ZAKELIJKE_MAIL_AUTO).catch(() => false)));
  const account: ZfMailAccount = {
    address: check.address,
    localPart: check.localPart,
    ...(eigen ? { domain: eigen } : {}),
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
      await maakMailbox(account, input.password);
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
      key: eigen ? "zfmail:eigen-domein" : "zfmail:new",
      severity: "warning",
      title: eigen ? "Zakelijk mailadres op een eigen domein aangevraagd" : "Nieuw ZekerFlex-mailadres aangevraagd",
      detail: eigen
        ? `${account.displayName} wil ${account.address}. Kijk wat een mailbox op ${eigen} bij TransIP kost en activeer het in Admin → ZekerFlex Mail; de mailregels van het domein gaan dan vanzelf mee.`
        : `${account.displayName} wil ${account.address}. Zet de TransIP-sleutel op de server; daarna activeer je het in Admin → ZekerFlex Mail.`,
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

// --- AVG (12 nov 2026, besluit 86): de mailbox hangt aan een userId, dus hij is persoonlijk -------------------------------

/** userId van een mailbox waarvan het account is gewist (AVG); het adres blijft vergrendeld. */
export const ZF_GEWIST = "gewist";

/**
 * Inzage (art. 15): de mailbox van deze gebruiker, zonder het verzegelde wachtwoord en zonder wat over anderen gaat
 * (wie in de geschiedenis iets deed, en de notitie van een beheerder). Staat onder het adres, niet onder de userId,
 * dus exportUserKv vindt hem niet vanzelf.
 */
export async function zfMailVoorInzage(userId: string): Promise<{ key: string; updatedAt: Date; value: Record<string, unknown> } | null> {
  const a = await accountOfUser(userId);
  if (!a) return null;
  const { pendingPasswordSealed: _geheim, history, ...rest } = a;
  void _geheim;
  return {
    key: accountKey(a.address),
    updatedAt: new Date(a.activatedAt ?? a.createdAt),
    value: { ...rest, history: history.map((h) => ({ at: h.at, what: h.what.split(":")[0] ?? h.what })) },
  };
}

/**
 * Wissen (art. 17, vanuit anonymizeUser): de mailbox geblokkeerd (zoals adminAction "blokkeer", met de koppeling aan de
 * mailpagina weg), zonder naam, herstel-adres en wachtwoord, userId "gewist", en in de geschiedenis alleen "gewist (AVG)".
 * Het adres blijft vergrendeld: niemand kan het opnieuw claimen en de mail van de vorige eigenaar krijgen. De mailbox bij
 * TransIP opheffen is een eigenaar-taak (lib/admin/owner-todos.ts), niet automatisch. Een tweede keer doet niets.
 */
export async function wisZfMailVan(userId: string, nu: Date = new Date()): Promise<"geen" | "gewist"> {
  const address = await kvGet<string>(userKey(userId));
  if (!address) return "geen";
  const account = await kvGet<ZfMailAccount>(accountKey(address));
  if (!account || account.userId === ZF_GEWIST) return "geen";
  const conn = await getMailboxConnection(userId).catch(() => null);
  if (conn?.email === account.address) await deleteMailboxConnection(userId);
  const gewist: ZfMailAccount = {
    address: account.address,
    localPart: account.localPart,
    userId: ZF_GEWIST,
    tenantId: account.tenantId,
    displayName: "",
    status: "geblokkeerd",
    recoveryEmail: null,
    createdAt: account.createdAt,
    activatedAt: account.activatedAt,
    history: [{ at: nu.toISOString(), what: "gewist (AVG)", by: "systeem" }],
  };
  await kvSet(accountKey(address), gewist);
  await kvDelete(userKey(userId));
  return "gewist";
}

/** Adressen van gewiste accounts die bij TransIP nog een mailbox hebben (zonder sleutel of bij een storing: alle gewiste). */
export async function teOpheffenBijTransip(): Promise<string[]> {
  const gewist = (await listAccounts()).filter((a) => a.userId === ZF_GEWIST);
  if (gewist.length === 0) return [];
  const bij = await takenAtHost().catch(() => null);
  return gewist.filter((a) => !bij || bij.size === 0 || bij.has(a.localPart.toLowerCase())).map((a) => a.address);
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

/** "Je mailadres werkt": naar het herstel-adres (meestal het login-adres) van wie het aanvroeg. Nederlands (werkgeversapp). */
export function adresWerktMail(a: Pick<ZfMailAccount, "address" | "displayName" | "recoveryEmail">) {
  const link = `${env.APP_BASE_URL.replace(/\/+$/, "")}/werkgever/mail`;
  const voornaam = a.displayName.split(" ")[0] || a.displayName;
  const subject = `Je mailadres ${a.address} werkt`;
  return {
    to: a.recoveryEmail ?? "",
    subject,
    kind: "zfmail-actief",
    text: `Hoi ${voornaam},\n\nJe mailadres ${a.address} is klaar. Je mail komt binnen in ZekerFlex, onder Mail: ${link}\n\nVragen? Antwoord gewoon op deze mail.`,
    html: mailShell(subject, `<p>Hoi ${voornaam},</p><p>Je mailadres <strong>${a.address}</strong> is klaar. Je mail komt binnen in ZekerFlex, onder Mail.</p>${mailButton(link, "Naar je mail")}<p>Vragen? Antwoord gewoon op deze mail.</p>`),
  };
}

/** Admin: make a waiting request real (needs the TransIP key), or block/unblock an address. */
export async function adminAction(input: z.infer<typeof adminActionSchema>, admin: { userId: string; name: string }): Promise<ZfMailAccount> {
  const account = await kvGet<ZfMailAccount>(accountKey(input.address));
  if (!account) throw AppError.notFound("Dit adres bestaat niet.");
  const now = new Date().toISOString();

  if (input.action === "activeer") {
    if (account.status !== "aangevraagd" || !account.pendingPasswordSealed) throw AppError.precondition("Dit adres wacht niet op activering.");
    if (!transipConfigured()) throw AppError.precondition("Zet eerst de TransIP-sleutel op de server (Admin → Te doen).");
    const password = openSecret(account.pendingPasswordSealed, PENDING_PURPOSE);
    await maakMailbox(account, password);
    hostCache = null;
    delete account.pendingPasswordSealed;
    account.status = "actief";
    account.activatedAt = now;
    if (!(await getMailboxConnection(account.userId))) await connectForUser(account, password);
    // het scherm beloofde "je krijgt bericht zodra hij werkt" (queuedBody): nu ook echt; een storing hier houdt het activeren niet tegen
    if (account.recoveryEmail) await sendMail(adresWerktMail(account)).catch(() => undefined);
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
