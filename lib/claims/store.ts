import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Annulerings-claims. Als een opdrachtgever een dienst annuleert nadat er
// iemand was uitgekozen, kan de kracht een claim indienen voor 50% van de
// klus. De opdrachtgever keurt goed of af. Filesystem, advisory:
//   storage/claims/<id>.json
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

const dir = () => join(process.cwd(), "storage", "claims");
const file = (id: string) => join(dir(), `${id.replace(/[^a-z0-9-]/gi, "")}.json`);

async function write(c: CancellationClaim): Promise<void> {
  await mkdir(dir(), { recursive: true });
  await writeFile(file(c.id), JSON.stringify(c, null, 2), "utf8");
}

export async function getClaim(id: string): Promise<CancellationClaim | null> {
  const p = file(id);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(await readFile(p, "utf8")) as CancellationClaim;
  } catch {
    return null;
  }
}

async function all(): Promise<CancellationClaim[]> {
  if (!existsSync(dir())) return [];
  const files = (await readdir(dir())).filter((f) => f.endsWith(".json"));
  const out: CancellationClaim[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await readFile(join(dir(), f), "utf8")) as CancellationClaim);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1));
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
