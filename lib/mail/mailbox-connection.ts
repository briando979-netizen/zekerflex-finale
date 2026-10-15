import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { HostRejectedError, resolvePublicHost } from "@/lib/security/public-host";
import type { ImapConfig } from "@/lib/mail/imap";
import type { SmtpConfig } from "@/lib/mail/smtp";
import type { ServerSettings } from "@/lib/mail/presets";

// ---------------------------------------------------------------------------
// A user's own mailbox, connected over IMAP (read) + SMTP (send) — employers
// read and answer their regular mail inside ZekerFlex. Stored in the
// KeyValueStore with the app password sealed (lib/security/sealed-secret).
//   key "mailbox-connection:<userId>"         — one per user
//   key "mailbox-sent:<userId>:<id>"          — mail sent from the dashboard
// ---------------------------------------------------------------------------

const PURPOSE = "mailbox-password";

export interface MailboxConnection {
  userId: string;
  email: string;
  displayName: string | null;
  username: string;
  imap: ServerSettings;
  smtp: ServerSettings;
  passwordSealed: string;
  connectedAt: string;
}

export interface DashboardSentMail {
  id: string;
  at: string;
  to: string;
  subject: string;
  text: string;
}

const connectionKey = (userId: string) => `mailbox-connection:${userId}`;
const sentPrefix = (userId: string) => `mailbox-sent:${userId}:`;

export function sealMailboxPassword(password: string): string {
  return sealSecret(password, PURPOSE);
}

export async function getMailboxConnection(userId: string): Promise<MailboxConnection | null> {
  return kvGet<MailboxConnection>(connectionKey(userId));
}

export async function saveMailboxConnection(conn: MailboxConnection): Promise<void> {
  await kvSet(connectionKey(conn.userId), conn);
}

export async function deleteMailboxConnection(userId: string): Promise<void> {
  await kvDelete(connectionKey(userId));
}

/** What the browser may see — never the password. */
export function publicConnection(conn: MailboxConnection) {
  return {
    email: conn.email,
    displayName: conn.displayName,
    username: conn.username,
    imap: conn.imap,
    smtp: conn.smtp,
    connectedAt: conn.connectedAt,
  };
}

type ConnectionSettings = Pick<MailboxConnection, "username" | "imap" | "smtp">;

/** IMAP config to the vetted public address, certificate checked. */
export async function imapConfigFor(conn: ConnectionSettings, password: string): Promise<ImapConfig> {
  return {
    host: conn.imap.host,
    port: conn.imap.port,
    secure: true,
    user: conn.username,
    pass: password,
    address: await resolvePublicHost(conn.imap.host),
    verifyTls: true,
    timeout: 15,
  };
}

/** SMTP config to the vetted public address, certificate checked, never in plaintext. */
export async function smtpConfigFor(conn: ConnectionSettings, password: string): Promise<SmtpConfig> {
  return {
    host: conn.smtp.host,
    port: conn.smtp.port,
    secure: conn.smtp.secure,
    user: conn.username,
    pass: password,
    address: await resolvePublicHost(conn.smtp.host),
    verifyTls: true,
    requireTls: true,
    timeout: 15,
    clientName: "zekerflex.com",
  };
}

export function mailboxPassword(conn: MailboxConnection): string {
  return openSecret(conn.passwordSealed, PURPOSE);
}

/** The caller's connection plus its password, or a 412 the UI turns into "connect your mailbox". */
export async function requireMailbox(userId: string): Promise<{ conn: MailboxConnection; password: string }> {
  const conn = await getMailboxConnection(userId);
  if (!conn) throw AppError.precondition("Nog geen mailbox gekoppeld.");
  try {
    return { conn, password: mailboxPassword(conn) };
  } catch {
    throw AppError.precondition("De koppeling met je mailbox moet opnieuw worden ingesteld.");
  }
}

/** A mail-server failure in words an employer can act on. */
export function describeMailError(err: unknown, server: ServerSettings, kind: "IMAP" | "SMTP"): string {
  if (err instanceof HostRejectedError) return err.message;
  const e = err as NodeJS.ErrnoException;
  const msg = `${e?.code ?? ""} ${e?.message ?? String(err)}`;
  const where = `${server.host}:${server.port}`;
  if (/biedt geen/i.test(msg)) return `${kind}-server ${where}: ${e.message}`;
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME|certificate/i.test(msg)) {
    return `Het beveiligingscertificaat van ${server.host} klopt niet; controleer de servernaam.`;
  }
  if (/AUTHENTICATIONFAILED|AUTHENTICATE|LOGIN|credentials|password|\b535\b|\b534\b|auth/i.test(msg)) {
    return "Inloggen geweigerd — controleer je e-mailadres of gebruikersnaam en je (app-)wachtwoord.";
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return `${kind}-server ${server.host} bestaat niet; controleer de servernaam.`;
  if (/ECONNREFUSED|ETIMEDOUT|timeout|ECONNRESET|EHOSTUNREACH/i.test(msg)) {
    return `Geen verbinding met de ${kind}-server ${where}; controleer servernaam en poort.`;
  }
  return `${kind}-server ${where}: ${(e?.message ?? String(err)).slice(0, 200)}`;
}

export async function recordDashboardSent(userId: string, mail: Omit<DashboardSentMail, "id" | "at">): Promise<DashboardSentMail> {
  const rec: DashboardSentMail = { ...mail, id: randomUUID().slice(0, 12), at: new Date().toISOString() };
  await kvSet(`${sentPrefix(userId)}${rec.id}`, rec);
  return rec;
}

export async function listDashboardSent(userId: string, limit = 100): Promise<DashboardSentMail[]> {
  const rows = await kvListValues<DashboardSentMail>(sentPrefix(userId), 2000);
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}
