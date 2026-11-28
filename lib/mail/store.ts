import { randomBytes, randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import type { BounceSoort } from "@/lib/mail/bounce";

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
  /** de mail kaatste terug (lib/mail/bounce-ronde.ts): "afgeleverd" betekende alleen dat TransIP hem aannam */
  bounce?: { soort: BounceSoort; code: string; at: string };
}

export async function saveSentMessage(rec: SentRecord): Promise<void> {
  await kvSet(sentKey(rec.id), rec);
}

// Sorteren, zoeken en tellen gebeurt in Postgres: de postbus telt duizenden mails met hun volledige inhoud (28 nov: 3.418,
// ±16 MB). Eerst alles ophalen en dan in JS sorteren kostte 2-3 s per bezoek aan Beheer → Mail en aan "ZekerFlex-post".
// `at` is een ISO-tijd, dus sorteren op tekst is sorteren op tijd.

/** Hoeveel recente mails "opnieuw versturen" langsloopt (app/api/admin/mail/resend); de teller "mislukt" kijkt net zo ver. */
export const OPNIEUW_VENSTER = 300;

export async function listSentMessages(limit = 100): Promise<SentRecord[]> {
  const rows = await prisma.$queryRaw<{ value: unknown }[]>`
    SELECT value FROM "KeyValueStore"
    WHERE key LIKE 'mail-sent:%'
    ORDER BY value->>'at' DESC NULLS LAST
    LIMIT ${limit}`;
  return rows.map((r) => r.value as SentRecord);
}

/** De nieuwste mails aan één adres (hoofdletters en spaties tellen niet), zonder afgemelde. */
export async function listSentMessagesTo(email: string, limit = 100): Promise<SentRecord[]> {
  const adres = email.trim().toLowerCase();
  const rows = await prisma.$queryRaw<{ value: unknown }[]>`
    SELECT value FROM "KeyValueStore"
    WHERE key LIKE 'mail-sent:%'
      AND coalesce(value->>'suppressed', '') = ''
      AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(value->'to') AS t(adres) WHERE lower(btrim(t.adres)) = ${adres})
    ORDER BY value->>'at' DESC NULLS LAST
    LIMIT ${limit}`;
  return rows.map((r) => r.value as SentRecord);
}

export async function readSentMessage(id: string): Promise<SentRecord | null> {
  return kvGet<SentRecord>(sentKey(id));
}

/** Alle mails en de afgeleverde tellen mee (niet meer afgekapt op 1000); "mislukt" telt wat de knop opnieuw kan versturen. */
export async function mailboxStats(): Promise<{ total: number; delivered: number; failed: number }> {
  const rows = await prisma.$queryRaw<{ total: bigint; delivered: bigint; failed: bigint }[]>`
    WITH recent AS (
      SELECT value FROM "KeyValueStore" WHERE key LIKE 'mail-sent:%' ORDER BY value->>'at' DESC NULLS LAST LIMIT ${OPNIEUW_VENSTER}
    )
    SELECT
      (SELECT count(*) FROM "KeyValueStore" WHERE key LIKE 'mail-sent:%') AS total,
      (SELECT count(*) FROM "KeyValueStore" WHERE key LIKE 'mail-sent:%' AND value->>'delivered' = 'true') AS delivered,
      (SELECT count(*) FROM recent
        WHERE coalesce(value->>'delivered', 'false') <> 'true' AND value->>'transport' = 'smtp' AND coalesce(value->>'suppressed', '') = '') AS failed`;
  const r = rows[0];
  return { total: Number(r?.total ?? 0), delivered: Number(r?.delivered ?? 0), failed: Number(r?.failed ?? 0) };
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

/**
 * Make every open verification link/code of a user worthless — when they
 * correct a mistyped address, whoever got the mail at the WRONG address must
 * not be able to confirm the account. Returns how many were removed.
 */
export async function revokeTokensFor(userId: string): Promise<number> {
  const entries = await kvListEntries<TokenRecord>("mail-token:", 5000);
  let n = 0;
  for (const { key, value: rec } of entries) {
    if (rec.userId !== userId) continue;
    await kvDelete(key);
    n += 1;
  }
  return n;
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
