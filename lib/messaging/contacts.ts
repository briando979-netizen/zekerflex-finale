import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Recipient resolution + a small user directory for the chat UI. Read-only.
// ---------------------------------------------------------------------------

export interface ChatUser {
  userId: string;
  name: string;
  role: "freelancer" | "employer" | "admin" | "support";
  meta: string; // e.g. org / branch / "Vestigingsmanager"
}

/** Find a human to reach at the branch behind a shift (manager, else HQ admin). */
export async function resolveShiftContact(
  shiftId: string,
): Promise<{ userId: string; name: string; branch: string; shiftTitle: string } | null> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      title: true,
      branch: {
        select: {
          id: true,
          name: true,
          tenantId: true,
          managers: {
            select: { membership: { select: { userId: true, user: { select: { fullName: true, disabledAt: true } } } } },
          },
        },
      },
    },
  });
  if (!shift) return null;

  const branchManager = shift.branch.managers
    .map((m) => m.membership)
    .find((m) => !m.user.disabledAt);
  if (branchManager) {
    return {
      userId: branchManager.userId,
      name: branchManager.user.fullName,
      branch: shift.branch.name,
      shiftTitle: shift.title,
    };
  }

  // Fall back to any active HQ_ADMIN / LOCAL_MANAGER of the tenant.
  const fallback = await prisma.membership.findFirst({
    where: {
      tenantId: shift.branch.tenantId,
      role: { in: ["HQ_ADMIN", "LOCAL_MANAGER"] },
      user: { disabledAt: null },
    },
    select: { userId: true, user: { select: { fullName: true } } },
  });
  if (!fallback) return null;
  return {
    userId: fallback.userId,
    name: fallback.user.fullName,
    branch: shift.branch.name,
    shiftTitle: shift.title,
  };
}

/** Build display info for a set of userIds. */
export async function userDirectory(userIds: string[]): Promise<Map<string, ChatUser>> {
  const ids = [...new Set(userIds.filter((id) => id && id !== "system"))];
  const map = new Map<string, ChatUser>();
  if (ids.length === 0) return map;

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      fullName: true,
      memberships: { select: { role: true, tenant: { select: { name: true } } } },
      freelancerProfile: { select: { id: true } },
    },
  });

  for (const u of users) {
    const roles = u.memberships.map((m) => m.role);
    let role: ChatUser["role"] = "freelancer";
    let meta = "Freelancer";
    if (roles.includes("PLATFORM_ADMIN")) {
      role = "admin";
      meta = "ZekerFlex";
    } else if (roles.some((r) => ["HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER"].includes(r))) {
      role = "employer";
      meta = u.memberships[0]?.tenant.name ?? "Werkgever";
    } else if (!u.freelancerProfile) {
      role = "employer";
      meta = u.memberships[0]?.tenant.name ?? "Werkgever";
    }
    map.set(u.id, { userId: u.id, name: u.fullName, role, meta });
  }
  return map;
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const m = await prisma.membership.findFirst({
    where: { userId, role: "PLATFORM_ADMIN" },
    select: { id: true },
  });
  return Boolean(m);
}

/** One PLATFORM_ADMIN userId to attribute an outgoing support reply to (display only). */
export async function anyPlatformAdmin(): Promise<string | null> {
  const m = await prisma.membership.findFirst({
    where: { role: "PLATFORM_ADMIN", user: { disabledAt: null } },
    select: { userId: true },
  });
  return m?.userId ?? null;
}
