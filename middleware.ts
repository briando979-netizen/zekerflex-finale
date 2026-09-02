import { NextResponse, type NextRequest } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { hasAnyRole, matchRouteRule } from "@/lib/auth/rbac";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/werkgever/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/timesheets/:path*",
    "/api/shifts/:path*",
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

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const rule = matchRouteRule(req.nextUrl.pathname);
  if (!rule) return NextResponse.next();

  const bearer = req.headers.get("authorization");
  const token =
    req.cookies.get(SESSION_COOKIE)?.value ??
    (bearer?.startsWith("Bearer ") ? bearer.slice(7) : undefined);

  const claims = await decodeSession(token);

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
  const headers = new Headers(req.headers);
  headers.set("x-zekerflex-user-id", claims.sub);
  headers.set("x-zekerflex-user-email", claims.email);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}
