import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Is this company (tenant) verified enough to actually staff people?
//
// Until it is, a company may place ONE test klus: it is visible and freelancers
// can respond, but nobody gets scheduled on it (no assignment, no timesheet,
// no invoice). Verified means any of:
//   - the KVK registration checks out as active in the Handelsregister AND the
//     person who registered belongs to it: an own e-mail domain that fits the
//     registered name (lib/company/eigendom.ts). An active KVK number alone only
//     proves the company exists; anyone can type it (4 Nov 2026),
//   - a platform admin approved the company by hand (Admin → Bedrijven),
//   - the company already had people scheduled before this rule existed, so
//     existing customers are never suddenly blocked.
// ---------------------------------------------------------------------------

export type TenantVerifiedVia = "platform" | "kvk" | "admin" | "history";

const approvalKey = (tenantId: string) => `tenant-approved:${tenantId}`;
const bewijsKey = (tenantId: string) => `tenant-kvk-bewijs:${tenantId}`;

/** Proof that the registrant belongs to the KVK company (set at onboarding, lib/onboarding/employer.ts). */
export interface KvkBewijs {
  via: "domein";
  domein: string;
  at: string;
}

export async function setKvkBewijs(tenantId: string, bewijs: KvkBewijs): Promise<void> {
  await kvSet(bewijsKey(tenantId), bewijs);
}

/** inControle: the KVK is valid and active but nobody proved they belong to it, so ZekerFlex checks by hand. */
export async function tenantVerification(tenantId: string): Promise<{ verified: boolean; via: TenantVerifiedVia | null; inControle?: boolean }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { type: true, companyRegistration: { select: { isActive: true, insolvent: true } } },
  });
  if (!tenant) return { verified: false, via: null };
  if (tenant.type === "PLATFORM") return { verified: true, via: "platform" };
  const kvkActief = Boolean(tenant.companyRegistration?.isActive && !tenant.companyRegistration.insolvent);
  if (kvkActief && (await kvGet<KvkBewijs>(bewijsKey(tenantId)))) return { verified: true, via: "kvk" };
  if ((await kvGet<{ approved: boolean }>(approvalKey(tenantId)))?.approved) return { verified: true, via: "admin" };
  const staffed = await prisma.shiftAssignment.count({ where: { shift: { branch: { tenantId } } }, take: 1 });
  if (staffed > 0) return { verified: true, via: "history" };
  return { verified: false, via: null, inControle: kvkActief };
}

export async function isTenantVerified(tenantId: string): Promise<boolean> {
  return (await tenantVerification(tenantId)).verified;
}

export async function setTenantApproval(tenantId: string, approved: boolean, by: string): Promise<void> {
  await kvSet(approvalKey(tenantId), { approved, at: new Date().toISOString(), by });
}

/** Unverified companies get one test klus (not counting cancelled ones). */
export async function assertMayPlaceShift(tenantId: string): Promise<{ test: boolean }> {
  if (await isTenantVerified(tenantId)) return { test: false };
  const existing = await prisma.shift.count({ where: { branch: { tenantId }, status: { not: "CANCELLED" } } });
  if (existing >= 1) {
    throw AppError.precondition(
      "Je kunt één testklus plaatsen zolang je bedrijf nog niet is geverifieerd. Vul je KVK-nummer in bij Jouw start → Bedrijf verifiëren; zodra je bedrijf is goedgekeurd kun je onbeperkt klussen plaatsen en mensen inplannen.",
    );
  }
  return { test: true };
}

export const UNVERIFIED_ASSIGN_MESSAGE =
  "Dit bedrijf is nog niet geverifieerd. Je reactie is genoteerd — je wordt pas ingepland zodra hun KVK is goedgekeurd.";

/**
 * The company just became verified: tell every freelancer who reacted to its
 * test klus that they can now confirm (re-tapping "aannemen" schedules them).
 * Best-effort push; returns how many people were told.
 */
export async function notifyPendingReactions(tenantId: string): Promise<number> {
  try {
    const matches = await prisma.shiftMatch.findMany({
      where: {
        status: "VIEWED",
        shift: { branch: { tenantId }, startsAt: { gt: new Date() }, status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] } },
      },
      select: { shift: { select: { id: true, title: true, branch: { select: { tenant: { select: { name: true } } } } } }, freelancer: { select: { userId: true } } },
      take: 200,
    });
    if (matches.length === 0) return 0;
    const { sendUserPush } = await import("@/lib/notifications/push");
    let told = 0;
    for (const m of matches) {
      told += (await sendUserPush([m.freelancer.userId], {
        title: "Bedrijf geverifieerd — bevestig je klus",
        body: `${m.shift.branch.tenant.name} is goedgekeurd. Tik op "Aannemen" bij "${m.shift.title}" om ingepland te worden.`,
        data: { type: "shift", url: `/dashboard/klussen/${m.shift.id}`, tag: `verified-${m.shift.id}` },
        ttlSeconds: 6 * 60 * 60,
      }).catch(() => 0)) > 0 ? 1 : 0;
    }
    return told;
  } catch (err) {
    logger.warn("notify pending reactions failed", { tenantId, error: (err as Error).message });
    return 0;
  }
}
