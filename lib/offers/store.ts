import { randomUUID } from "node:crypto";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Counter-offers ("tegenbod") — Postgres-backed (KeyValueStore, key
// "offer:<id>"). A freelancer can propose a different rate before accepting a
// shift. Was local disk, unreliable on Vercel's serverless functions.
// ---------------------------------------------------------------------------

export type OfferStatus = "pending" | "accepted" | "declined" | "withdrawn";

export interface CounterOffer {
  id: string;
  at: string;
  userId: string;
  freelancerName: string;
  shiftId: string;
  shiftTitle: string;
  branch: string;
  listedRateCents: number;
  proposedRateCents: number;
  note: string;
  status: OfferStatus;
  respondedAt: string | null;
}

const key = (id: string) => `offer:${id}`;

export async function createCounterOffer(
  input: Omit<CounterOffer, "id" | "at" | "status" | "respondedAt">,
): Promise<CounterOffer> {
  // one active offer per (user, shift): withdraw any existing first
  const mine = await listCounterOffers(500);
  for (const o of mine) {
    if (o.userId === input.userId && o.shiftId === input.shiftId && o.status === "pending") {
      await setOfferStatus(o.id, "withdrawn");
    }
  }
  const rec: CounterOffer = {
    id: randomUUID().slice(0, 12),
    at: new Date().toISOString(),
    status: "pending",
    respondedAt: null,
    ...input,
  };
  await kvSet(key(rec.id), rec);
  return rec;
}

export async function listCounterOffers(limit = 200): Promise<CounterOffer[]> {
  const rows = await kvListValues<CounterOffer>("offer:", 2000);
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

export async function offersForUser(userId: string): Promise<CounterOffer[]> {
  return (await listCounterOffers(500)).filter((o) => o.userId === userId);
}

/** The freelancer's current (non-withdrawn) offer for a shift, if any. */
export async function myOfferForShift(userId: string, shiftId: string): Promise<CounterOffer | null> {
  const mine = await offersForUser(userId);
  return (
    mine.find((o) => o.shiftId === shiftId && o.status !== "withdrawn") ?? null
  );
}

export async function setOfferStatus(id: string, status: OfferStatus): Promise<CounterOffer | null> {
  const rec = await kvGet<CounterOffer>(key(id.replace(/[^a-z0-9-]/gi, "")));
  if (!rec) return null;
  rec.status = status;
  rec.respondedAt = status === "pending" ? null : new Date().toISOString();
  await kvSet(key(rec.id), rec);
  return rec;
}
