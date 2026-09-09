import { NextResponse, type NextRequest } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { hasAnyRole, matchRouteRule } from "@/lib/auth/rbac";
import { isPublicApiRoute } from "@/lib/auth/public-routes";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/werkgever/:path*",
    "/sales/:path*",
    "/admin/:path*",
    // Every API route now passes through this middleware. A route with no
    // more specific ROUTE_RULES entry and no entry in the public allowlist
    // (lib/auth/public-routes.ts) defaults to "must have a valid session" —
    // it can no longer be reachable unauthenticated just because the route
    // itself forgot to call requirePrincipal(). Role/organization/branch
    // checks beyond "is logged in" remain the route's own responsibility.
    "/api/:path*",
  ],
};

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function loginRedirect(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?callbackUrl=${encodeURIComponent(
    req.nextUrl.pathname + req.nextUrl.search,
  )}`;
  return NextResponse.redirect(url);
}

function sessionToken(req: NextRequest): string | undefined {
  const bearer = req.headers.get("authorization");
  return (
    req.cookies.get(SESSION_COOKIE)?.value ??
    (bearer?.startsWith("Bearer ") ? bearer.slice(7) : undefined)
  );
}

function withIdentityHeaders(req: NextRequest, claims: { sub: string; email: string }): NextResponse {
  const headers = new Headers(req.headers);
  headers.set("x-zekerflex-user-id", claims.sub);
  headers.set("x-zekerflex-user-email", claims.email);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;
  const rule = matchRouteRule(pathname);

  if (!rule) {
    // No specific role rule for this path. Page routes reaching here aren't
    // in the matcher (only dashboard/werkgever/sales/admin are, and those all
    // have a rule), so this branch is API-only: default-deny unless the path
    // is explicitly public.
    if (!pathname.startsWith("/api/") || isPublicApiRoute(pathname)) {
      return NextResponse.next();
    }
    const claims = await decodeSession(sessionToken(req));
    if (!claims) {
      return jsonError("UNAUTHENTICATED", "Authentication required", 401);
    }
    return withIdentityHeaders(req, claims);
  }

  const claims = await decodeSession(sessionToken(req));

  if (!claims) {
    return rule.redirectOnDeny
      ? loginRedirect(req)
      : jsonError("UNAUTHENTICATED", "Authentication required", 401);
  }

  if (!hasAnyRole(claims, rule.roles)) {
    if (rule.redirectOnDeny) {
      // Authenticated but wrong role for this area: send them to the router
      // page, which forwards to the home screen for their actual role.
      const url = req.nextUrl.clone();
      url.pathname = "/start";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return jsonError(
      "FORBIDDEN",
      `Requires one of: ${rule.roles.join(", ")}`,
      403,
    );
  }

  // Pass a verified identity hint + the pathname downstream (handlers and
  // layouts still re-validate; the pathname lets a layout skip its own gate
  // for e.g. the onboarding route it wraps).
  return withIdentityHeaders(req, claims);
}
