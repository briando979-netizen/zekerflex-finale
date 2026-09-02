import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Counter-offers ("tegenbod") on the filesystem — non-destructive. A freelancer
// can propose a different rate before accepting a shift. The offer is logged
// here and surfaced to the employer / ops; nothing touches the DB.
//   storage/offers/<id>.json
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

function dir(): string {
  return join(process.cwd(), "storage", "offers");
}

export async function createCounterOffer(
  input: Omit<CounterOffer, "id" | "at" | "status" | "respondedAt">,
): Promise<CounterOffer> {
  await mkdir(dir(), { recursive: true });
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
  await writeFile(join(dir(), `${rec.id}.json`), JSON.stringify(rec, null, 2), "utf8");
  return rec;
}

export async function listCounterOffers(limit = 200): Promise<CounterOffer[]> {
  if (!existsSync(dir())) return [];
  const files = (await readdir(dir())).filter((f) => f.endsWith(".json"));
  const out: CounterOffer[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await readFile(join(dir(), f), "utf8")) as CounterOffer);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
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
  const p = join(dir(), `${id.replace(/[^a-z0-9-]/gi, "")}.json`);
  if (!existsSync(p)) return null;
  try {
    const rec = JSON.parse(await readFile(p, "utf8")) as CounterOffer;
    rec.status = status;
    rec.respondedAt = status === "pending" ? null : new Date().toISOString();
    await writeFile(p, JSON.stringify(rec, null, 2), "utf8");
    return rec;
  } catch {
    return null;
  }
}
