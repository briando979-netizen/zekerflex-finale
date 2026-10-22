import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { inspectable, inspectSessionFor } from "@/lib/auth/inspect";
import type { RoleGrant } from "@/lib/auth/session";

// ---------------------------------------------------------------------------
// "Bekijk als" — an admin looks at the werknemer- or opdrachtgever-dashboard
// exactly as a chosen example account sees it, read-only, without losing the
// admin login. The example account's read-only inspect session lives in its
// own cookie (VIEW_AS_COOKIE); middleware swaps it in as the session for every
// request OUTSIDE /admin and /api/admin, so the admin area keeps the real one.
// ---------------------------------------------------------------------------

export { VIEW_AS_COOKIE } from "@/lib/auth/inspect";
export type ViewAsRole = "freelancer" | "employer";
const KEY = "admin:view-as";

export const VIEW_AS_HOME: Record<ViewAsRole, string> = {
  freelancer: "/dashboard/klussen",
  employer: "/werkgever",
};

export interface ViewAsAccount {
  userId: string;
  name: string;
  email: string;
}

export async function getViewAsAccounts(): Promise<Partial<Record<ViewAsRole, ViewAsAccount>>> {
  return (await kvGet<Partial<Record<ViewAsRole, ViewAsAccount>>>(KEY)) ?? {};
}

async function rolesOf(userId: string): Promise<{ user: { id: string; email: string; fullName: string }; roles: RoleGrant[] } | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, disabledAt: null },
    include: { memberships: { include: { scopedBranches: { select: { branchId: true } } } } },
  });
  if (!user) return null;
  return {
    user,
    roles: user.memberships.map((m) => ({ role: m.role, organizationId: m.tenantId, locationIds: m.scopedBranches.map((b) => b.branchId) })),
  };
}

/** Choose the example account for a role. Only test-able accounts (no admin/sales). */
export async function setViewAsAccount(role: ViewAsRole, userId: string): Promise<ViewAsAccount> {
  const found = await rolesOf(userId);
  if (!found) throw new Error("Gebruiker niet gevonden.");
  if (!inspectable(found.roles)) throw new Error("Beheerders- en salesaccounts kunnen geen voorbeeldaccount zijn.");
  const needs = role === "freelancer" ? ["FREELANCER"] : ["HQ_ADMIN", "LOCAL_MANAGER"];
  if (!found.roles.some((r) => needs.includes(r.role))) {
    throw new Error(role === "freelancer" ? "Dit account is geen werknemer." : "Dit account is geen opdrachtgever.");
  }
  const acc = { userId: found.user.id, name: found.user.fullName, email: found.user.email };
  await kvSet(KEY, { ...(await getViewAsAccounts()), [role]: acc });
  return acc;
}

/** The read-only session to put in VIEW_AS_COOKIE for this role, or null when none is set up. */
export async function viewAsSession(role: ViewAsRole): Promise<{ session: string; account: ViewAsAccount } | null> {
  const acc = (await getViewAsAccounts())[role];
  if (!acc) return null;
  const found = await rolesOf(acc.userId);
  if (!found || !inspectable(found.roles)) return null;
  const session = await inspectSessionFor({ sub: found.user.id, email: found.user.email, name: found.user.fullName, roles: found.roles });
  return { session, account: acc };
}
