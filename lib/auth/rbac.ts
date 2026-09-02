import type { UserRole } from "@prisma/client";
import type { RoleGrant, SessionClaims } from "@/lib/auth/session";

// Edge-safe RBAC helpers - no Prisma, no Node APIs. Shared by the middleware
// and the Node-side session validator.

export function rolesOf(claims: Pick<SessionClaims, "roles">): UserRole[] {
  return claims.roles.map((r) => r.role);
}

export function hasAnyRole(
  claims: Pick<SessionClaims, "roles">,
  allowed: readonly UserRole[],
): boolean {
  return claims.roles.some((r) => allowed.includes(r.role));
}

export function grantsForOrganization(
  claims: Pick<SessionClaims, "roles">,
  organizationId: string,
): RoleGrant[] {
  return claims.roles.filter((r) => r.organizationId === organizationId);
}

export interface RouteRule {
  /** Matched against the request pathname. First matching rule wins. */
  pattern: RegExp;
  /** Any one of these roles (in any organization) grants access. */
  roles: readonly UserRole[];
  /** true => unauthenticated page requests redirect to /login; false => 401. */
  redirectOnDeny: boolean;
}

/**
 * Order matters: the most specific patterns must come first.
 */
export const ROUTE_RULES: RouteRule[] = [
  {
    pattern: /^\/dashboard(?:\/|$)/,
    roles: ["FREELANCER"],
    redirectOnDeny: true,
  },
  {
    pattern: /^\/werkgever(?:\/|$)/,
    roles: ["LOCAL_MANAGER", "HQ_ADMIN", "DISPUTE_MANAGER", "PLATFORM_ADMIN"],
    redirectOnDeny: true,
  },
  {
    pattern: /^\/admin\/disputes(?:\/|$)/,
    roles: ["DISPUTE_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN"],
    redirectOnDeny: true,
  },
  {
    pattern: /^\/admin\/(jarvis|analytics|studio|audit|systeem|mail)(?:\/|$)/,
    roles: ["PLATFORM_ADMIN"],
    redirectOnDeny: true,
  },
  {
    pattern: /^\/admin\/verloning(?:\/|$)/,
    roles: ["HQ_ADMIN", "PLATFORM_ADMIN"],
    redirectOnDeny: true,
  },
  {
    pattern: /^\/admin(?:\/|$)/,
    roles: ["HQ_ADMIN", "PLATFORM_ADMIN"],
    redirectOnDeny: true,
  },
  {
    pattern: /^\/api\/admin(?:\/|$)/,
    roles: ["PLATFORM_ADMIN"],
    redirectOnDeny: false,
  },
  {
    pattern: /^\/api\/timesheets\/approve(?:\/|$)/,
    roles: ["LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN"],
    redirectOnDeny: false,
  },
  {
    pattern: /^\/api\/shifts\/[^/]+\/match(?:\/|$)/,
    roles: ["LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN"],
    redirectOnDeny: false,
  },
];

export function matchRouteRule(pathname: string): RouteRule | null {
  return ROUTE_RULES.find((r) => r.pattern.test(pathname)) ?? null;
}
