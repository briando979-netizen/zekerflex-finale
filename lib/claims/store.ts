import { randomUUID } from "node:crypto";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Annulerings-claims. Als een opdrachtgever een dienst annuleert nadat er
// iemand was uitgekozen, kan de kracht een claim indienen voor 50% van de
// klus. De opdrachtgever keurt goed of af. Postgres-backed (KeyValueStore,
// key "claim:<id>") — was local disk, unreliable op Vercel serverless.
// ---------------------------------------------------------------------------

export type ClaimStatus = "filed" | "approved" | "rejected" | "paid" | "withdrawn";

export interface CancellationClaim {
  id: string;
  shiftId: string;
  shiftTitle: string;
  assignmentId: string | null;
  freelancerUserId: string;
  freelancerName: string;
  employerUserId: string | null;
  branchName: string;
  shiftValueCents: number; // full gross value of the seat
  claimedCents: number; // 50%
  reason: string;
  status: ClaimStatus;
  filedAt: string;
  decidedAt?: string;
  decidedByUserId?: string;
  decisionNote?: string;
}

const key = (id: string) => `claim:${id}`;

async function write(c: CancellationClaim): Promise<void> {
  await kvSet(key(c.id), c);
}

export async function getClaim(id: string): Promise<CancellationClaim | null> {
  return kvGet<CancellationClaim>(key(id.replace(/[^a-z0-9-]/gi, "")));
}

async function all(): Promise<CancellationClaim[]> {
  const rows = await kvListValues<CancellationClaim>("claim:", 5000);
  return rows.sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1));
}

export async function claimsForFreelancer(userId: string): Promise<CancellationClaim[]> {
  return (await all()).filter((c) => c.freelancerUserId === userId);
}

export async function claimsForEmployer(userIds: string[], branchNames: string[]): Promise<CancellationClaim[]> {
  const set = new Set(userIds);
  const branches = new Set(branchNames);
  return (await all()).filter((c) => (c.employerUserId && set.has(c.employerUserId)) || branches.has(c.branchName));
}

export async function existingClaimFor(shiftId: string, freelancerUserId: string): Promise<CancellationClaim | null> {
  return (await all()).find((c) => c.shiftId === shiftId && c.freelancerUserId === freelancerUserId && c.status !== "withdrawn") ?? null;
}

export async function fileClaim(
  input: Omit<CancellationClaim, "id" | "status" | "filedAt" | "claimedCents"> & { claimedCents?: number },
): Promise<CancellationClaim> {
  const claimed = input.claimedCents ?? Math.round(input.shiftValueCents * 0.5);
  const claim: CancellationClaim = {
    ...input,
    claimedCents: claimed,
    reason: input.reason.trim().slice(0, 800),
    id: randomUUID().slice(0, 12),
    status: "filed",
    filedAt: new Date().toISOString(),
  };
  await write(claim);
  return claim;
}

export async function decideClaim(
  id: string,
  decision: "approved" | "rejected",
  byUserId: string,
  note?: string,
): Promise<CancellationClaim | null> {
  const claim = await getClaim(id);
  if (!claim || claim.status !== "filed") return null;
  claim.status = decision;
  claim.decidedAt = new Date().toISOString();
  claim.decidedByUserId = byUserId;
  if (note) claim.decisionNote = note.slice(0, 500);
  await write(claim);
  return claim;
}
