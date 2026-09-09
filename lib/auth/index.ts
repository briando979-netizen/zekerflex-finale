import { cookies, headers } from "next/headers";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import {
  decodeSession,
  SESSION_COOKIE,
  type RoleGrant,
} from "@/lib/auth/session";

// ---------------------------------------------------------------------------
// Production session validator (Node runtime: route handlers, server actions,
// server components). Verifies the jose session token, then rehydrates the
// principal's grants from the database so a role/scope change takes effect on
// the next request rather than waiting for token expiry.
// ---------------------------------------------------------------------------

export interface Principal {
  userId: string;
  email: string;
  fullName: string;
  /** Null until the user confirms their e-mail address. */
  emailVerifiedAt: Date | null;
  /** (role, organization, locations) grants, straight from the database. */
  grants: RoleGrant[];
  /** Back-compat view used across the codebase. */
  memberships: { tenantId: string; role: UserRole }[];
  /** Flattened location (branch) ids the principal is explicitly scoped to. */
  managedBranchIds: string[];
}

function readSessionToken(): string | undefined {
  const fromCookie = cookies().get(SESSION_COOKIE)?.value;
  if (fromCookie) return fromCookie;
  const auth = headers().get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
}

export async function getPrincipal(): Promise<Principal | null> {
  const claims = await decodeSession(readSessionToken());
  if (!claims) return null;

  const user = await prisma.user.findFirst({
    where: { id: claims.sub, disabledAt: null },
    include: {
      memberships: {
        include: { scopedBranches: { select: { branchId: true } } },
      },
    },
  });
  if (!user) return null;

  const grants: RoleGrant[] = user.memberships.map((m) => ({
    role: m.role,
    organizationId: m.tenantId,
    locationIds: m.scopedBranches.map((b) => b.branchId),
  }));

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    emailVerifiedAt: user.emailVerifiedAt,
    grants,
    memberships: grants.map((g) => ({
      tenantId: g.organizationId,
      role: g.role,
    })),
    managedBranchIds: [...new Set(grants.flatMap((g) => g.locationIds))],
  };
}

export async function requirePrincipal(): Promise<Principal> {
  const p = await getPrincipal();
  if (!p) throw AppError.unauthenticated();
  return p;
}

export function hasRole(p: Principal, ...roles: UserRole[]): boolean {
  return p.grants.some((g) => roles.includes(g.role));
}

export function requireRole(p: Principal, ...roles: UserRole[]): void {
  if (!hasRole(p, ...roles)) {
    throw AppError.forbidden(`Requires one of: ${roles.join(", ")}`);
  }
}

/**
 * Assert the principal may act on the given organization (tenant) at all.
 * PLATFORM_ADMIN passes unconditionally.
 */
export function assertOrganizationAccess(p: Principal, organizationId: string): void {
  if (hasRole(p, "PLATFORM_ADMIN")) return;
  if (!p.grants.some((g) => g.organizationId === organizationId)) {
    throw AppError.forbidden("No membership for this organization");
  }
}

/**
 * Assert the principal may approve / administer work for a specific location
 * (branch) within an organization (tenant).
 *
 *  - PLATFORM_ADMIN            -> always
 *  - HQ_ADMIN of the org       -> any location
 *  - LOCAL_MANAGER of the org  -> unscoped (all locations) or scoped to this one
 */
export function assertBranchAccess(
  p: Principal,
  branchId: string,
  tenantId: string,
): void {
  if (hasRole(p, "PLATFORM_ADMIN")) return;

  const orgGrants = p.grants.filter((g) => g.organizationId === tenantId);
  if (orgGrants.length === 0) {
    throw AppError.forbidden("No membership for this organization");
  }

  for (const g of orgGrants) {
    if (g.role === "HQ_ADMIN" || g.role === "PLATFORM_ADMIN") return;
    if (g.role === "LOCAL_MANAGER") {
      if (g.locationIds.length === 0) return; // unscoped => all locations
      if (g.locationIds.includes(branchId)) return;
    }
  }
  throw AppError.forbidden("No access to this location");
}

/** Alias using the platform's public vocabulary. */
export const assertLocationAccess = assertBranchAccess;
