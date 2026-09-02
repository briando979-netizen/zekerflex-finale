import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Filesystem-backed newsletter store. No database, no Redis — same pattern as
// storage/mail.
//   storage/newsletter/subscribers/<sha256(email)>.json  — one per address
//   storage/newsletter/campaigns/<ts>-<id>.json          — one per broadcast
//
// Double opt-in: a signup lands as "pending" and only receives broadcasts once
// the confirmation link is clicked ("confirmed"). Unsubscribing is one click
// and never deletes the record (so we can prove consent history).
// ---------------------------------------------------------------------------

export type SubscriberStatus = "pending" | "confirmed" | "unsubscribed";

export interface Subscriber {
  email: string;
  status: SubscriberStatus;
  /** opaque token used for both confirm and unsubscribe links */
  token: string;
  source: string;
  createdAt: string;
  confirmedAt?: string;
  unsubscribedAt?: string;
}

export interface Campaign {
  id: string;
  at: string;
  subject: string;
  bodyText: string;
  sentById: string;
  sentByEmail: string;
  recipients: number;
  delivered: number;
  failed: number;
}

function root(): string {
  return join(process.cwd(), "storage", "newsletter");
}
const subsDir = () => join(root(), "subscribers");
const campDir = () => join(root(), "campaigns");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

function key(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

async function readSub(k: string): Promise<Subscriber | null> {
  try {
    return JSON.parse(await readFile(join(subsDir(), `${k}.json`), "utf8")) as Subscriber;
  } catch {
    return null;
  }
}

async function writeSub(rec: Subscriber): Promise<void> {
  await mkdir(subsDir(), { recursive: true });
  await writeFile(join(subsDir(), `${key(rec.email)}.json`), JSON.stringify(rec, null, 2), "utf8");
}

export interface SubscribeResult {
  status: "created" | "already-confirmed" | "resent";
  subscriber: Subscriber;
}

/**
 * Idempotent. A new address is stored pending and needs confirmation. An
 * address that already confirmed is a no-op. A pending or previously
 * unsubscribed address is reset to pending and gets a fresh token.
 */
export async function subscribe(email: string, source: string): Promise<SubscribeResult> {
  const k = key(email);
  const existing = await readSub(k);

  if (existing?.status === "confirmed") {
    return { status: "already-confirmed", subscriber: existing };
  }

  const rec: Subscriber = {
    email,
    status: "pending",
    token: randomBytes(24).toString("base64url"),
    source: source.slice(0, 40) || "web",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  await writeSub(rec);
  return { status: existing ? "resent" : "created", subscriber: rec };
}

async function findByToken(token: string): Promise<Subscriber | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !existsSync(subsDir())) return null;
  const files = (await readdir(subsDir())).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    try {
      const rec = JSON.parse(await readFile(join(subsDir(), f), "utf8")) as Subscriber;
      if (rec.token === token) return rec;
    } catch {
      /* skip */
    }
  }
  return null;
}

export async function confirm(token: string): Promise<Subscriber | null> {
  const rec = await findByToken(token);
  if (!rec) return null;
  if (rec.status === "confirmed") return rec;
  const updated: Subscriber = { ...rec, status: "confirmed", confirmedAt: new Date().toISOString() };
  await writeSub(updated);
  return updated;
}

export async function unsubscribe(token: string): Promise<Subscriber | null> {
  const rec = await findByToken(token);
  if (!rec) return null;
  if (rec.status === "unsubscribed") return rec;
  const updated: Subscriber = {
    ...rec,
    status: "unsubscribed",
    unsubscribedAt: new Date().toISOString(),
  };
  await writeSub(updated);
  return updated;
}

export async function listSubscribers(status?: SubscriberStatus): Promise<Subscriber[]> {
  if (!existsSync(subsDir())) return [];
  const files = (await readdir(subsDir())).filter((f) => f.endsWith(".json"));
  const out: Subscriber[] = [];
  for (const f of files) {
    try {
      const rec = JSON.parse(await readFile(join(subsDir(), f), "utf8")) as Subscriber;
      if (!status || rec.status === status) out.push(rec);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function subscriberStats(): Promise<{
  total: number;
  confirmed: number;
  pending: number;
  unsubscribed: number;
}> {
  const all = await listSubscribers();
  return {
    total: all.length,
    confirmed: all.filter((s) => s.status === "confirmed").length,
    pending: all.filter((s) => s.status === "pending").length,
    unsubscribed: all.filter((s) => s.status === "unsubscribed").length,
  };
}

export async function saveCampaign(rec: Omit<Campaign, "id" | "at">): Promise<Campaign> {
  await mkdir(campDir(), { recursive: true });
  const full: Campaign = { ...rec, id: randomUUID().slice(0, 12), at: new Date().toISOString() };
  await writeFile(
    join(campDir(), `${full.at.replace(/[:.]/g, "-")}-${full.id}.json`),
    JSON.stringify(full, null, 2),
    "utf8",
  );
  return full;
}

export async function listCampaigns(limit = 50): Promise<Campaign[]> {
  if (!existsSync(campDir())) return [];
  const files = (await readdir(campDir()))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit);
  const out: Campaign[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await readFile(join(campDir(), f), "utf8")) as Campaign);
    } catch {
      /* skip */
    }
  }
  return out;
}
