import { randomUUID } from "node:crypto";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Annulerings-claims, in twee richtingen:
//   - freelancer_owed: de opdrachtgever annuleert nadat iemand was uitgekozen.
//     De freelancer dient zelf een claim in ("filed"); de opdrachtgever keurt
//     goed/af.
//   - employer_owed: de freelancer zegt te laat af of komt niet opdagen. Het
//     systeem zet de claim meteen klaar ("offered"); de opdrachtgever besluit
//     zelf of die hem incasseert (-> "filed", direct gevolgd door facturatie)
//     of laat gaan (-> "withdrawn").
// Postgres-backed (KeyValueStore, key "claim:<id>") — was local disk,
// unreliable op Vercel serverless.
// ---------------------------------------------------------------------------

export type ClaimStatus = "offered" | "filed" | "approved" | "rejected" | "paid" | "withdrawn";
export type ClaimDirection = "freelancer_owed" | "employer_owed";

export interface CancellationClaim {
  id: string;
  direction: ClaimDirection;
  shiftId: string;
  shiftTitle: string;
  assignmentId: string | null;
  freelancerUserId: string;
  freelancerName: string;
  employerUserId: string | null;
  /** The employer organization behind the shift — the real billing/credit target, not just a display name. */
  employerTenantId: string;
  branchName: string;
  shiftValueCents: number; // full gross value of the seat
  claimedCents: number; // 50%
  reason: string;
  status: ClaimStatus;
  filedAt: string;
  decidedAt?: string;
  decidedByUserId?: string;
  decisionNote?: string;

  /**
   * The party that owes the money. For employer_owed this is always the
   * freelancer. For freelancer_owed this is the resolved branch
   * manager/HQ-admin acting for the employer tenant — null in the rare case
   * no active manager exists at all, in which case collection/ban enforcement
   * can't target a specific account (billing still targets employerTenantId).
   */
  debtorUserId: string | null;
  debtorFreelancerId: string | null;

  // Real-money collection lifecycle — see lib/claims/billing.ts and
  // lib/claims/collections-sweep.ts. Unset until the claim is actually filed.
  invoiceId?: string;
  paidAt?: string;
  reminderSentAt?: string;
  overdueEscalatedAt?: string;
  lateFeeCents?: number;
  bannedAt?: string;
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

/** Claims whose collection timeline needs checking — anything issued and not yet paid/withdrawn. */
export async function claimsAwaitingPayment(): Promise<CancellationClaim[]> {
  return (await all()).filter((c) => c.invoiceId && c.status !== "paid" && c.status !== "withdrawn");
}

/** Open incasso dossiers — escalated (incassokosten charged) but not yet paid or banned. */
export async function claimsInIncasso(): Promise<CancellationClaim[]> {
  return (await all()).filter((c) => c.overdueEscalatedAt && !c.paidAt && !c.bannedAt);
}

/** The freelancer_owed path: the freelancer files a claim after the employer cancelled. */
export async function fileClaim(
  input: Omit<CancellationClaim, "id" | "direction" | "status" | "filedAt" | "claimedCents" | "debtorFreelancerId"> & {
    claimedCents?: number;
  },
): Promise<CancellationClaim> {
  const claimed = input.claimedCents ?? Math.round(input.shiftValueCents * 0.5);
  const claim: CancellationClaim = {
    ...input,
    direction: "freelancer_owed",
    claimedCents: claimed,
    reason: input.reason.trim().slice(0, 800),
    id: randomUUID().slice(0, 12),
    status: "filed",
    filedAt: new Date().toISOString(),
    debtorUserId: input.debtorUserId,
    debtorFreelancerId: null,
  };
  await write(claim);
  return claim;
}

/**
 * The employer_owed path: the system found a late cancellation or no-show and
 * sets a claim option in front of the employer, who decides whether to
 * exercise it (decideOfferedClaim). Nothing is charged yet.
 */
export async function offerEmployerClaim(input: {
  shiftId: string;
  shiftTitle: string;
  assignmentId: string;
  freelancerUserId: string;
  freelancerName: string;
  freelancerProfileId: string;
  employerUserId: string | null;
  employerTenantId: string;
  branchName: string;
  shiftValueCents: number;
  reason: string;
}): Promise<CancellationClaim> {
  const claim: CancellationClaim = {
    id: randomUUID().slice(0, 12),
    direction: "employer_owed",
    shiftId: input.shiftId,
    shiftTitle: input.shiftTitle,
    assignmentId: input.assignmentId,
    freelancerUserId: input.freelancerUserId,
    freelancerName: input.freelancerName,
    employerUserId: input.employerUserId,
    employerTenantId: input.employerTenantId,
    branchName: input.branchName,
    shiftValueCents: input.shiftValueCents,
    claimedCents: Math.round(input.shiftValueCents * 0.5),
    reason: input.reason.trim().slice(0, 800),
    status: "offered",
    filedAt: new Date().toISOString(),
    debtorUserId: input.freelancerUserId,
    debtorFreelancerId: input.freelancerProfileId,
  };
  await write(claim);
  return claim;
}

/** The employer accepts (exercises) or declines an offered employer_owed claim. */
export async function decideOfferedClaim(
  id: string,
  decision: "accepted" | "declined",
  byUserId: string,
): Promise<CancellationClaim | null> {
  const claim = await getClaim(id);
  if (!claim || claim.status !== "offered") return null;
  claim.status = decision === "accepted" ? "filed" : "withdrawn";
  claim.decidedAt = new Date().toISOString();
  claim.decidedByUserId = byUserId;
  await write(claim);
  return claim;
}

/** The employer approves or rejects a freelancer-filed (freelancer_owed) claim. */
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

/** Attaches the just-created real Invoice to a claim once billing kicks off. */
export async function attachClaimInvoice(id: string, invoiceId: string): Promise<CancellationClaim | null> {
  const claim = await getClaim(id);
  if (!claim) return null;
  claim.invoiceId = invoiceId;
  await write(claim);
  return claim;
}

export async function markClaimPaid(id: string): Promise<CancellationClaim | null> {
  const claim = await getClaim(id);
  if (!claim) return null;
  claim.status = "paid";
  claim.paidAt = new Date().toISOString();
  await write(claim);
  return claim;
}

export async function markClaimReminderSent(id: string): Promise<void> {
  const claim = await getClaim(id);
  if (!claim) return;
  claim.reminderSentAt = new Date().toISOString();
  await write(claim);
}

export async function markClaimEscalated(id: string, lateFeeCents: number): Promise<void> {
  const claim = await getClaim(id);
  if (!claim) return;
  claim.overdueEscalatedAt = new Date().toISOString();
  claim.lateFeeCents = lateFeeCents;
  await write(claim);
}

export async function markClaimDebtorBanned(id: string): Promise<void> {
  const claim = await getClaim(id);
  if (!claim) return;
  claim.bannedAt = new Date().toISOString();
  await write(claim);
}
