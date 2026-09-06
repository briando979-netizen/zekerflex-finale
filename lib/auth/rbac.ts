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
 * Deliberate unauthenticated transport surface. Webhooks and internal jobs
 * authenticate with their own signature/secret in their route handlers.
 * Everything else under /api is covered by the authenticated fallback below.
 */
interface PublicApiRule {
  pattern: RegExp;
  methods: readonly string[];
  authentication: "public" | "signature" | "internal-secret";
}

export const PUBLIC_API_RULES: readonly PublicApiRule[] = [
  { pattern: /^\/api\/auth(?:\/|$)/, methods: ["GET", "POST"], authentication: "public" },
  { pattern: /^\/api\/public\/v1\/shifts\/?$/, methods: ["GET"], authentication: "public" },
  { pattern: /^\/api\/webhooks\/didit\/?$/, methods: ["POST"], authentication: "signature" },
  { pattern: /^\/api\/internal\/(?:active-hours\/recompute|ai\/watchdog|matching\/tick|orchestration\/tick|rag\/reindex)\/?$/, methods: ["GET", "POST"], authentication: "internal-secret" },
  { pattern: /^\/api\/(?:health|ready|status)\/?$/, methods: ["GET"], authentication: "public" },
  { pattern: /^\/api\/register\/?$/, methods: ["POST"], authentication: "public" },
  { pattern: /^\/api\/company\/(?:lookup|search)\/?$/, methods: ["GET"], authentication: "public" },
  { pattern: /^\/api\/company\/register\/?$/, methods: ["POST"], authentication: "public" },
  { pattern: /^\/api\/demo\/?$/, methods: ["POST"], authentication: "public" },
  { pattern: /^\/api\/demo\/[^/]+\/ics\/?$/, methods: ["GET"], authentication: "public" },
  { pattern: /^\/api\/(?:werken-bij|nieuwsbrief)\/?$/, methods: ["POST"], authentication: "public" },
  { pattern: /^\/api\/nieuwsbrief\/afmelden\/?$/, methods: ["GET", "POST"], authentication: "public" },
  { pattern: /^\/api\/mail\/afmelden\/?$/, methods: ["GET", "POST"], authentication: "public" },
  { pattern: /^\/api\/mail\/voorkeuren\/?$/, methods: ["POST"], authentication: "public" },
  { pattern: /^\/api\/kennis\/whitepaper\/[^/]+\/?$/, methods: ["GET"], authentication: "public" },
  { pattern: /^\/api\/analytics\/track\/?$/, methods: ["POST"], authentication: "public" },
  { pattern: /^\/api\/chat\/?$/, methods: ["POST"], authentication: "public" },
  { pattern: /^\/api\/chat\/rate\/?$/, methods: ["POST"], authentication: "public" },
  { pattern: /^\/api\/orgs\/[^/]+\/photo\/?$/, methods: ["GET"], authentication: "public" },
];

export function isPublicApiRoute(pathname: string, method = "GET"): boolean {
  return PUBLIC_API_RULES.some(
    (rule) => rule.pattern.test(pathname) && rule.methods.includes(method.toUpperCase()),
  );
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
  {
    pattern: /^\/api(?:\/|$)/,
    roles: ["FREELANCER", "LOCAL_MANAGER", "HQ_ADMIN", "DISPUTE_MANAGER", "PLATFORM_ADMIN"],
    redirectOnDeny: false,
  },
];

export function matchRouteRule(pathname: string): RouteRule | null {
  return ROUTE_RULES.find((r) => r.pattern.test(pathname)) ?? null;
}
