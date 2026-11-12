import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getBuitenlandBewijs } from "@/lib/company/buitenland";

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

export interface VerificatieFeiten {
  platform: boolean;
  /** de KVK-inschrijving is actief en niet failliet */
  kvkActief: boolean;
  /** aangemelde persoon hoort aantoonbaar bij het bedrijf (KvkBewijs) */
  kvkBewijs: boolean;
  /** een beheerder keurde het bedrijf met de hand goed */
  goedgekeurd: boolean;
  /** er stonden al mensen ingepland */
  ingepland: boolean;
  /** bedrijf buiten Nederland met een btw- of registratienummer: wacht op een beheerder */
  buitenlands?: boolean;
}

/** De regel zelf, puur: één bron voor de poort en voor Admin → Onboarding (die dit voor vele bedrijven tegelijk uitrekent). */
export function verificatieUitFeiten(f: VerificatieFeiten): { verified: boolean; via: TenantVerifiedVia | null; inControle?: boolean; buitenlands?: boolean } {
  if (f.platform) return { verified: true, via: "platform" };
  if (f.kvkActief && f.kvkBewijs) return { verified: true, via: "kvk" };
  if (f.goedgekeurd) return { verified: true, via: "admin" };
  if (f.ingepland) return { verified: true, via: "history" };
  if (f.buitenlands) return { verified: false, via: null, inControle: true, buitenlands: true };
  return { verified: false, via: null, inControle: f.kvkActief };
}

export const TENANT_APPROVAL_PREFIX = "tenant-approved:";
export const TENANT_BEWIJS_PREFIX = "tenant-kvk-bewijs:";

/** inControle: the KVK is valid and active but nobody proved they belong to it, so ZekerFlex checks by hand. */
export async function tenantVerification(tenantId: string): Promise<{ verified: boolean; via: TenantVerifiedVia | null; inControle?: boolean; buitenlands?: boolean }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { type: true, country: true, vatNumber: true, companyRegistration: { select: { isActive: true, insolvent: true } } },
  });
  if (!tenant) return { verified: false, via: null };
  const platform = tenant.type === "PLATFORM";
  const kvkActief = Boolean(tenant.companyRegistration?.isActive && !tenant.companyRegistration.insolvent);
  if (platform) return verificatieUitFeiten({ platform, kvkActief, kvkBewijs: false, goedgekeurd: false, ingepland: false });
  const kvkBewijs = kvkActief && Boolean(await kvGet<KvkBewijs>(bewijsKey(tenantId)));
  if (kvkBewijs) return verificatieUitFeiten({ platform, kvkActief, kvkBewijs, goedgekeurd: false, ingepland: false });
  const goedgekeurd = Boolean((await kvGet<{ approved: boolean }>(approvalKey(tenantId)))?.approved);
  if (goedgekeurd) return verificatieUitFeiten({ platform, kvkActief, kvkBewijs, goedgekeurd, ingepland: false });
  const ingepland = (await prisma.shiftAssignment.count({ where: { shift: { branch: { tenantId } } }, take: 1 })) > 0;
  // Een bedrijf buiten Nederland heeft geen KVK: het wacht op een beheerder (lib/company/buitenland.ts).
  const buitenlands = !ingepland && (tenant.country ?? "NL") !== "NL" && Boolean(tenant.vatNumber || (await getBuitenlandBewijs(tenantId)));
  return verificatieUitFeiten({ platform, kvkActief, kvkBewijs, goedgekeurd, ingepland, buitenlands });
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
      "Je kunt één testklus plaatsen zolang je bedrijf nog niet is geverifieerd. Vul je bedrijfsgegevens in bij Jouw start → Bedrijf verifiëren (het KVK-nummer, of voor een buitenlands bedrijf het btw- of registratienummer); zodra je bedrijf is goedgekeurd kun je onbeperkt klussen plaatsen en mensen inplannen.",
    );
  }
  return { test: true };
}

export const UNVERIFIED_ASSIGN_MESSAGE =
  "Dit bedrijf is nog niet geverifieerd. Je reactie is genoteerd — je wordt pas ingepland zodra hun bedrijf is goedgekeurd.";

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
    const { sendLocalizedPush } = await import("@/lib/notifications/localized-push");
    let told = 0;
    for (const m of matches) {
      // in de app-taal van de werker (WORKER_PUSH)
      told += (await sendLocalizedPush([m.freelancer.userId], (t) => ({
        title: t.verifiedTitle,
        body: t.verifiedBody(m.shift.branch.tenant.name, m.shift.title),
        data: { type: "shift", url: `/dashboard/klussen/${m.shift.id}`, tag: `verified-${m.shift.id}` },
        ttlSeconds: 6 * 60 * 60,
      })).catch(() => 0)) > 0 ? 1 : 0;
    }
    return told;
  } catch (err) {
    logger.warn("notify pending reactions failed", { tenantId, error: (err as Error).message });
    return 0;
  }
}
