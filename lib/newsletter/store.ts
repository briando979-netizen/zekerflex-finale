import { createHash, randomBytes, randomUUID } from "node:crypto";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Postgres-backed newsletter store (KeyValueStore) — was local disk,
// unreliable on Vercel's serverless functions.
//   key "newsletter-subscriber:<sha256(email)>"  — one per address
//   key "newsletter-campaign:<id>"               — one per broadcast
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

const SUB_PREFIX = "newsletter-subscriber:";
const CAMP_PREFIX = "newsletter-campaign:";
function subKey(email: string): string {
  return `${SUB_PREFIX}${createHash("sha256").update(email).digest("hex")}`;
}

async function readSub(k: string): Promise<Subscriber | null> {
  return kvGet<Subscriber>(k);
}

async function writeSub(rec: Subscriber): Promise<void> {
  await kvSet(subKey(rec.email), rec);
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
  const existing = await readSub(subKey(email));

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
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const rows = await kvListValues<Subscriber>(SUB_PREFIX, 50_000);
  return rows.find((r) => r.token === token) ?? null;
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
  const rows = await kvListValues<Subscriber>(SUB_PREFIX, 50_000);
  const filtered = status ? rows.filter((r) => r.status === status) : rows;
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  const full: Campaign = { ...rec, id: randomUUID().slice(0, 12), at: new Date().toISOString() };
  await kvSet(`${CAMP_PREFIX}${full.id}`, full);
  return full;
}

export async function listCampaigns(limit = 50): Promise<Campaign[]> {
  const rows = await kvListValues<Campaign>(CAMP_PREFIX, 2000);
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}
