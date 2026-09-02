import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isOptionalCategory, OPTIONAL_CATEGORIES } from "@/lib/mail/categories";

// ---------------------------------------------------------------------------
// Per-recipient e-mail preferences, keyed by e-mail address so they work for
// both accounts and non-accounts (job applicants, demo requesters).
//   storage/mail/prefs/<sha256(lowercased email)>.json
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

function dir(): string {
  return join(process.cwd(), "storage", "mail", "prefs");
}
function key(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
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
  const p = join(dir(), `${key(email)}.json`);
  if (!existsSync(p)) return empty(email);
  try {
    const raw = JSON.parse(await readFile(p, "utf8")) as Partial<MailPrefs>;
    return {
      ...empty(email),
      ...raw,
      off: (raw.off ?? []).filter(isOptionalCategory),
    };
  } catch {
    return empty(email);
  }
}

async function write(rec: MailPrefs): Promise<MailPrefs> {
  await mkdir(dir(), { recursive: true });
  const next = { ...rec, updatedAt: new Date().toISOString() };
  await writeFile(join(dir(), `${key(rec.email)}.json`), JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Read prefs, creating (and persisting a token) on first access. */
export async function getMailPrefs(email: string): Promise<MailPrefs> {
  const p = join(dir(), `${key(email)}.json`);
  const rec = await read(email);
  if (!existsSync(p)) await write(rec);
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
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !existsSync(dir())) return null;
  for (const f of (await readdir(dir())).filter((x) => x.endsWith(".json"))) {
    try {
      const rec = JSON.parse(await readFile(join(dir(), f), "utf8")) as MailPrefs;
      if (rec.token === token) return { ...empty(rec.email), ...rec, off: (rec.off ?? []).filter(isOptionalCategory) };
    } catch {
      /* skip */
    }
  }
  return null;
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
