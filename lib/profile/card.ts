import { prisma } from "@/lib/prisma";
import { getUserProfileExtra, getOrgProfileExtra } from "@/lib/profile/store";
import { reviewSummary, type ReviewSummary } from "@/lib/reviews/store";

// ---------------------------------------------------------------------------
// The card shown when you click a person in the chat / anywhere they appear.
// Photo is auto-carried from their account. Read-only over Postgres + the
// filesystem review/profile stores.
// ---------------------------------------------------------------------------

export interface UserCard {
  userId: string;
  name: string;
  role: "freelancer" | "employer" | "admin";
  headline: string | null;
  avatarUrl: string | null;
  meta: string;
  freelancer?: {
    reliabilityPct: number;
    attendancePct: number | null;
    shiftsCompleted: number;
    badge: string;
    reviews: ReviewSummary;
  };
  company?: {
    tenantId: string;
    name: string;
    websiteUrl: string | null;
    photoUrl: string | null;
    about: string | null;
    reviews: ReviewSummary;
  };
}

export function avatarUrlFor(userId: string, hasAvatar: boolean): string | null {
  return hasAvatar ? `/api/profile/${userId}/avatar` : null;
}

async function attendancePct(freelancerId: string): Promise<number | null> {
  const now = new Date();
  const past = await prisma.shiftAssignment.findMany({
    where: { freelancerId, shift: { endsAt: { lt: now } } },
    select: { cancelledAt: true, timesheet: { select: { status: true, actualStart: true } } },
  });
  if (past.length === 0) return null;
  let showed = 0;
  let missed = 0;
  for (const a of past) {
    const ts = a.timesheet;
    const cameIn =
      !a.cancelledAt &&
      (ts?.actualStart != null || ["SUBMITTED", "APPROVED", "DISPUTED"].includes(ts?.status ?? ""));
    if (cameIn) showed++;
    else missed++;
  }
  const total = showed + missed;
  return total === 0 ? null : Math.round((showed / total) * 100);
}

export async function getUserCard(userId: string): Promise<UserCard | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      memberships: {
        select: { role: true, tenantId: true, tenant: { select: { id: true, name: true } } },
      },
      freelancerProfile: {
        select: {
          id: true,
          reliabilityScore: true,
          shiftsCompleted: true,
          badgeLevel: true,
        },
      },
    },
  });
  if (!user) return null;

  const extra = await getUserProfileExtra(userId);
  const avatarUrl = avatarUrlFor(userId, Boolean(extra.avatarUploadId));
  const roles = user.memberships.map((m) => m.role);
  const isAdmin = roles.includes("PLATFORM_ADMIN");
  const isEmployer = roles.some((r) =>
    ["HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER"].includes(r),
  );

  const base: UserCard = {
    userId,
    name: user.fullName,
    role: isAdmin ? "admin" : isEmployer ? "employer" : "freelancer",
    headline: extra.headline ?? null,
    avatarUrl,
    meta: isAdmin
      ? "ZekerFlex"
      : isEmployer
        ? user.memberships[0]?.tenant.name ?? "Werkgever"
        : "Freelancer",
  };

  if (base.role === "freelancer" && user.freelancerProfile) {
    const fp = user.freelancerProfile;
    base.freelancer = {
      reliabilityPct: Math.round(fp.reliabilityScore * 100),
      attendancePct: await attendancePct(fp.id),
      shiftsCompleted: fp.shiftsCompleted,
      badge: fp.badgeLevel,
      reviews: await reviewSummary("freelancer", userId),
    };
  }

  if (base.role === "employer") {
    const tenant = user.memberships[0]?.tenant;
    if (tenant) {
      const org = await getOrgProfileExtra(tenant.id);
      base.company = {
        tenantId: tenant.id,
        name: tenant.name,
        websiteUrl: org.websiteUrl ?? null,
        photoUrl: org.photoUploadId ? `/api/orgs/${tenant.id}/photo` : null,
        about: org.about ?? null,
        reviews: await reviewSummary("company", tenant.id),
      };
    }
  }

  return base;
}
