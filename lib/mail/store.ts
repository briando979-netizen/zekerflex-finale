import { randomBytes, randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Filesystem-backed mail store. No database, no Redis.
//   storage/mail/sent/<ts>-<id>.json   — one record per outbound message
//   storage/mail/tokens/<token>.json   — e-mail verification tokens
// This IS the admin's mailbox: /admin/mail reads storage/mail/sent.
// ---------------------------------------------------------------------------

function root(): string {
  return join(process.cwd(), "storage", "mail");
}
const sentDir = () => join(root(), "sent");
const tokenDir = () => join(root(), "tokens");

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
  await mkdir(sentDir(), { recursive: true });
  const safeTs = rec.at.replace(/[:.]/g, "-");
  await writeFile(join(sentDir(), `${safeTs}-${rec.id}.json`), JSON.stringify(rec, null, 2), "utf8");
}

export async function listSentMessages(limit = 100): Promise<SentRecord[]> {
  if (!existsSync(sentDir())) return [];
  const files = (await readdir(sentDir()))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit);
  const out: SentRecord[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await readFile(join(sentDir(), f), "utf8")) as SentRecord);
    } catch {
      /* skip a corrupt record */
    }
  }
  return out;
}

export async function readSentMessage(id: string): Promise<SentRecord | null> {
  if (!existsSync(sentDir())) return null;
  const files = (await readdir(sentDir())).filter((f) => f.endsWith(`-${id}.json`));
  if (!files[0]) return null;
  try {
    return JSON.parse(await readFile(join(sentDir(), files[0]), "utf8")) as SentRecord;
  } catch {
    return null;
  }
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
  await mkdir(tokenDir(), { recursive: true });
  const token = randomBytes(24).toString("base64url");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const rec: TokenRecord = { userId, exp: Date.now() + ttlSeconds * 1000, code, tries: 0 };
  await writeFile(join(tokenDir(), `${token}.json`), JSON.stringify(rec), "utf8");
  void pruneTokens();
  return { token, code };
}

/**
 * Confirm a user by the 6-digit code from their e-mail. Returns the userId on a
 * match (and consumes the token), null otherwise. Brute-force protected: the
 * token is destroyed after 5 wrong attempts.
 */
export async function consumeCode(userId: string, code: string): Promise<string | null> {
  if (!/^\d{6}$/.test(code) || !existsSync(tokenDir())) return null;
  const files = (await readdir(tokenDir())).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const path = join(tokenDir(), f);
    try {
      const rec = JSON.parse(await readFile(path, "utf8")) as TokenRecord;
      if (rec.userId !== userId || !rec.code) continue;
      if (rec.exp < Date.now()) {
        await unlink(path).catch(() => undefined);
        continue;
      }
      if (rec.code === code) {
        await unlink(path).catch(() => undefined);
        return rec.userId;
      }
      const tries = (rec.tries ?? 0) + 1;
      if (tries >= 5) await unlink(path).catch(() => undefined);
      else await writeFile(path, JSON.stringify({ ...rec, tries }), "utf8").catch(() => undefined);
    } catch {
      /* skip */
    }
  }
  return null;
}

/** Returns the userId and deletes the token, or null when invalid/expired. */
export async function consumeToken(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const path = join(tokenDir(), `${token}.json`);
  if (!existsSync(path)) return null;
  try {
    const rec = JSON.parse(await readFile(path, "utf8")) as TokenRecord;
    await unlink(path).catch(() => undefined);
    if (rec.exp < Date.now()) return null;
    return rec.userId;
  } catch {
    return null;
  }
}

/** Latest still-valid token + code for a user, so the verify page can show it locally. */
export async function latestVerification(
  userId: string,
): Promise<{ token: string; code: string | null } | null> {
  if (!existsSync(tokenDir())) return null;
  const files = (await readdir(tokenDir())).filter((f) => f.endsWith(".json"));
  let best: { token: string; code: string | null; exp: number } | null = null;
  for (const f of files) {
    try {
      const rec = JSON.parse(await readFile(join(tokenDir(), f), "utf8")) as TokenRecord;
      if (rec.userId === userId && rec.exp > Date.now() && (!best || rec.exp > best.exp)) {
        best = { token: f.replace(/\.json$/, ""), code: rec.code ?? null, exp: rec.exp };
      }
    } catch {
      /* skip */
    }
  }
  return best ? { token: best.token, code: best.code } : null;
}

/** Latest still-valid link for a user, so the verify page can show it locally. */
export async function latestTokenForUser(userId: string): Promise<string | null> {
  return (await latestVerification(userId))?.token ?? null;
}

async function pruneTokens(): Promise<void> {
  try {
    const files = (await readdir(tokenDir())).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      try {
        const rec = JSON.parse(await readFile(join(tokenDir(), f), "utf8")) as TokenRecord;
        if (rec.exp < Date.now()) await unlink(join(tokenDir(), f)).catch(() => undefined);
      } catch {
        /* skip */
      }
    }
  } catch {
    /* dir may not exist yet */
  }
}
