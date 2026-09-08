import { randomBytes, randomInt } from "node:crypto";
import { kvDelete, kvGet, kvListEntries, kvListValues, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Postgres-backed mail store (KeyValueStore) — was local disk, unreliable on
// Vercel's serverless functions. Two independent uses:
//   key "mail-sent:<id>"    — one record per outbound message (admin mailbox)
//   key "mail-token:<token>" — e-mail verification tokens
// This IS the admin's mailbox: /admin/mail reads the "mail-sent:" keys.
// ---------------------------------------------------------------------------

const sentKey = (id: string) => `mail-sent:${id}`;
const tokenKey = (token: string) => `mail-token:${token}`;

export interface SentRecord {
  id: string;
  at: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  kind: string;
  delivered: boolean;
  transport: "smtp" | "mailbox";
  error?: string;
  /** recipient unsubscribed from this optional category — not sent */
  suppressed?: string;
}

export async function saveSentMessage(rec: SentRecord): Promise<void> {
  await kvSet(sentKey(rec.id), rec);
}

export async function listSentMessages(limit = 100): Promise<SentRecord[]> {
  const rows = await kvListValues<SentRecord>("mail-sent:", 5000);
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

export async function readSentMessage(id: string): Promise<SentRecord | null> {
  return kvGet<SentRecord>(sentKey(id));
}

export async function mailboxStats(): Promise<{ total: number; delivered: number; failed: number }> {
  const all = await listSentMessages(1000);
  return {
    total: all.length,
    delivered: all.filter((m) => m.delivered).length,
    failed: all.filter((m) => !m.delivered && m.transport === "smtp").length,
  };
}

// ---- verification tokens --------------------------------------------------

interface TokenRecord {
  userId: string;
  exp: number;
  /** 6-digit code, the alternative to clicking the link */
  code?: string;
  /** failed code attempts — the record self-destructs after too many */
  tries?: number;
}

export interface MintedToken {
  token: string;
  code: string;
}

export async function mintToken(userId: string, ttlSeconds: number): Promise<MintedToken> {
  const token = randomBytes(24).toString("base64url");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const rec: TokenRecord = { userId, exp: Date.now() + ttlSeconds * 1000, code, tries: 0 };
  await kvSet(tokenKey(token), rec);
  return { token, code };
}

/**
 * Confirm a user by the 6-digit code from their e-mail. Returns the userId on a
 * match (and consumes the token), null otherwise. Brute-force protected: the
 * token is destroyed after 5 wrong attempts.
 */
export async function consumeCode(userId: string, code: string): Promise<string | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const entries = await kvListEntries<TokenRecord>("mail-token:", 5000);
  for (const { key, value: rec } of entries) {
    if (rec.userId !== userId || !rec.code) continue;
    if (rec.exp < Date.now()) {
      await kvDelete(key);
      continue;
    }
    if (rec.code === code) {
      await kvDelete(key);
      return rec.userId;
    }
    const tries = (rec.tries ?? 0) + 1;
    if (tries >= 5) await kvDelete(key);
    else await kvSet(key, { ...rec, tries });
  }
  return null;
}

/** Returns the userId and deletes the token, or null when invalid/expired. */
export async function consumeToken(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const rec = await kvGet<TokenRecord>(tokenKey(token));
  if (!rec) return null;
  await kvDelete(tokenKey(token));
  if (rec.exp < Date.now()) return null;
  return rec.userId;
}

/** Latest still-valid token + code for a user, so the verify page can show it locally. */
export async function latestVerification(
  userId: string,
): Promise<{ token: string; code: string | null } | null> {
  const entries = await kvListEntries<TokenRecord>("mail-token:", 5000);
  let best: { token: string; code: string | null; exp: number } | null = null;
  for (const { key, value: rec } of entries) {
    if (rec.userId === userId && rec.exp > Date.now() && (!best || rec.exp > best.exp)) {
      best = { token: key.slice("mail-token:".length), code: rec.code ?? null, exp: rec.exp };
    }
  }
  return best ? { token: best.token, code: best.code } : null;
}

/** Latest still-valid link for a user, so the verify page can show it locally. */
export async function latestTokenForUser(userId: string): Promise<string | null> {
  return (await latestVerification(userId))?.token ?? null;
}
