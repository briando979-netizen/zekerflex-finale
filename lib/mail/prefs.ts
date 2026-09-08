import { createHash, randomBytes } from "node:crypto";
import { isOptionalCategory, OPTIONAL_CATEGORIES } from "@/lib/mail/categories";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Per-recipient e-mail preferences, keyed by e-mail address so they work for
// both accounts and non-accounts (job applicants, demo requesters).
// Postgres-backed (KeyValueStore, key "mail-prefs:<sha256(lowercased email)>")
// — was local disk, unreliable on Vercel's serverless functions.
//
// Essential mail (verification, invoices, payslips, …) always sends and is
// never affected by this. Only optional categories (see mail/categories.ts)
// are suppressed here.
// ---------------------------------------------------------------------------

export interface MailPrefs {
  email: string;
  /** hard opt-out of every optional category */
  unsubscribedAll: boolean;
  /** optional category slugs the recipient has switched off */
  off: string[];
  /** opaque token for one-click / link-based changes without logging in */
  token: string;
  updatedAt: string;
}

const PREFIX = "mail-prefs:";
function key(email: string): string {
  return `${PREFIX}${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`;
}

function empty(email: string): MailPrefs {
  return {
    email: email.trim().toLowerCase(),
    unsubscribedAll: false,
    off: [],
    token: randomBytes(24).toString("base64url"),
    updatedAt: new Date(0).toISOString(),
  };
}

async function read(email: string): Promise<MailPrefs> {
  const raw = await kvGet<Partial<MailPrefs>>(key(email));
  if (!raw) return empty(email);
  return {
    ...empty(email),
    ...raw,
    off: (raw.off ?? []).filter(isOptionalCategory),
  };
}

async function write(rec: MailPrefs): Promise<MailPrefs> {
  const next = { ...rec, updatedAt: new Date().toISOString() };
  await kvSet(key(rec.email), next);
  return next;
}

/** Read prefs, creating (and persisting a token) on first access. */
export async function getMailPrefs(email: string): Promise<MailPrefs> {
  const existing = await kvGet<Partial<MailPrefs>>(key(email));
  const rec = await read(email);
  if (!existing) await write(rec);
  return rec;
}

/** Is this optional category allowed for this recipient? Essential → always true. */
export async function mailAllowed(email: string, categorySlug: string): Promise<boolean> {
  if (!isOptionalCategory(categorySlug)) return true;
  const rec = await read(email);
  if (rec.unsubscribedAll) return false;
  return !rec.off.includes(categorySlug);
}

export async function setCategory(email: string, slug: string, on: boolean): Promise<MailPrefs> {
  if (!isOptionalCategory(slug)) return read(email);
  const rec = await getMailPrefs(email);
  const off = new Set(rec.off);
  if (on) off.delete(slug);
  else off.add(slug);
  return write({ ...rec, off: [...off], unsubscribedAll: on ? rec.unsubscribedAll : rec.unsubscribedAll });
}

export async function setUnsubscribedAll(email: string, value: boolean): Promise<MailPrefs> {
  const rec = await getMailPrefs(email);
  return write({ ...rec, unsubscribedAll: value });
}

export async function findByToken(token: string): Promise<MailPrefs | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const rows = await kvListValues<MailPrefs>(PREFIX, 20_000);
  const rec = rows.find((r) => r.token === token);
  return rec ? { ...empty(rec.email), ...rec, off: (rec.off ?? []).filter(isOptionalCategory) } : null;
}

/** Summary for a preferences UI: which optional categories are on. */
export async function mailPrefsView(email: string): Promise<{
  unsubscribedAll: boolean;
  categories: { slug: string; label: string; desc: string; on: boolean }[];
  token: string;
}> {
  const rec = await getMailPrefs(email);
  return {
    unsubscribedAll: rec.unsubscribedAll,
    token: rec.token,
    categories: OPTIONAL_CATEGORIES.map((c) => ({
      ...c,
      on: !rec.unsubscribedAll && !rec.off.includes(c.slug),
    })),
  };
}
