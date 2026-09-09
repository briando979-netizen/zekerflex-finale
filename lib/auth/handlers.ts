import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  requirePrincipal,
  requireRole,
  assertOrganizationAccess,
  assertBranchAccess,
  type Principal,
} from "@/lib/auth";

// ---------------------------------------------------------------------------
// Route-handler wrappers. Every protected API route repeats the same three
// lines (requirePrincipal, an optional requireRole/assert*, and a
// try/catch -> toErrorBody(err) error boundary) by hand — easy to forget one
// of them in a new route, which is exactly how the disputes-console and
// GraphQL-resolver leaks happened. These wrappers make the auth check and the
// error boundary structural instead of something to remember.
// ---------------------------------------------------------------------------

type RouteContext<P> = { params: P };
// Response, not NextResponse: a couple of handlers stream (jarvis/quick's
// SSE-style reply) via a plain `new Response(readableStream)`, which is not
// assignable to NextResponse even though NextResponse extends Response.
type AuthedHandler<P> = (
  request: Request,
  ctx: RouteContext<P> & { principal: Principal },
) => Promise<Response> | Response;

function errorResponse(request: Request, err: unknown): NextResponse {
  const { status, body, headers } = toErrorBody(err);
  if (status >= 500) {
    const route = `${request.method} ${new URL(request.url).pathname}`;
    logger.forRequest(request, { route }).error("request failed", { error: (err as Error).message });
  }
  return NextResponse.json(body, { status, headers });
}

/** Requires a valid, non-disabled session. No role check. */
export function withAuth<P = Record<string, string>>(handler: AuthedHandler<P>) {
  return async (request: Request, ctx: RouteContext<P> = { params: {} as P }): Promise<Response> => {
    try {
      const principal = await requirePrincipal();
      return await handler(request, { ...ctx, principal });
    } catch (err) {
      return errorResponse(request, err);
    }
  };
}

/** Requires the caller to hold at least one of the given roles, anywhere in their grants. */
export function withAdminAccess<P = Record<string, string>>(
  roles: UserRole[],
  handler: AuthedHandler<P>,
) {
  return withAuth<P>(async (request, ctx) => {
    requireRole(ctx.principal, ...roles);
    return handler(request, ctx);
  });
}

/**
 * Requires membership in a specific tenant. `resolveOrgId` runs after
 * authentication, since most routes only learn the tenant once they've
 * loaded the resource named in the URL (e.g. an invoice's recipientTenantId).
 */
export function withOrganizationAccess<P = Record<string, string>>(
  resolveOrgId: (request: Request, ctx: RouteContext<P> & { principal: Principal }) => string | Promise<string>,
  handler: AuthedHandler<P>,
) {
  return withAuth<P>(async (request, ctx) => {
    const organizationId = await resolveOrgId(request, ctx);
    assertOrganizationAccess(ctx.principal, organizationId);
    return handler(request, ctx);
  });
}

/** Requires access to a specific branch within a specific tenant. */
export function withBranchAccess<P = Record<string, string>>(
  resolveIds: (
    request: Request,
    ctx: RouteContext<P> & { principal: Principal },
  ) => { branchId: string; tenantId: string } | Promise<{ branchId: string; tenantId: string }>,
  handler: AuthedHandler<P>,
) {
  return withAuth<P>(async (request, ctx) => {
    const { branchId, tenantId } = await resolveIds(request, ctx);
    assertBranchAccess(ctx.principal, branchId, tenantId);
    return handler(request, ctx);
  });
}
