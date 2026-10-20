import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Is this company (tenant) verified enough to actually staff people?
//
// Until it is, a company may place ONE test klus: it is visible and freelancers
// can respond, but nobody gets scheduled on it (no assignment, no timesheet,
// no invoice). Verified means any of:
//   - the KVK registration checks out as active in the Handelsregister,
//   - a platform admin approved the company by hand (Admin → Bedrijven),
//   - the company already had people scheduled before this rule existed, so
//     existing customers are never suddenly blocked.
// ---------------------------------------------------------------------------

export type TenantVerifiedVia = "platform" | "kvk" | "admin" | "history";

const approvalKey = (tenantId: string) => `tenant-approved:${tenantId}`;

export async function tenantVerification(tenantId: string): Promise<{ verified: boolean; via: TenantVerifiedVia | null }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { type: true, companyRegistration: { select: { isActive: true, insolvent: true } } },
  });
  if (!tenant) return { verified: false, via: null };
  if (tenant.type === "PLATFORM") return { verified: true, via: "platform" };
  if (tenant.companyRegistration?.isActive && !tenant.companyRegistration.insolvent) return { verified: true, via: "kvk" };
  if ((await kvGet<{ approved: boolean }>(approvalKey(tenantId)))?.approved) return { verified: true, via: "admin" };
  const staffed = await prisma.shiftAssignment.count({ where: { shift: { branch: { tenantId } } }, take: 1 });
  if (staffed > 0) return { verified: true, via: "history" };
  return { verified: false, via: null };
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
      "Je kunt één testklus plaatsen zolang je KVK nog niet is geverifieerd. Rond je bedrijfsgegevens af (Jouw start → Jouw organisatie); zodra je KVK is goedgekeurd kun je onbeperkt klussen plaatsen en mensen inplannen.",
    );
  }
  return { test: true };
}

export const UNVERIFIED_ASSIGN_MESSAGE =
  "Dit bedrijf is nog niet geverifieerd. Je reactie is genoteerd — je wordt pas ingepland zodra hun KVK is goedgekeurd.";
