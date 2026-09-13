import { NextResponse, type NextRequest } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { hasAnyRole, matchRouteRule } from "@/lib/auth/rbac";
import { isPublicApiRoute } from "@/lib/auth/public-routes";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/security/csp";

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
    // Everything that renders HTML — so the per-request CSP nonce below is
    // attached to every document. Excludes API (JSON, handled above), Next
    // internals and static assets. Prefetch requests are skipped so a hovered
    // link doesn't force the target route into dynamic rendering.
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2|ttf|mp4|webmanifest|xml|txt)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

export const CORRELATION_HEADER = "x-correlation-id";
const CSP_HEADER = "Content-Security-Policy";
const NONCE_HEADER = "x-nonce";

const IS_DEV = process.env.NODE_ENV !== "production";

/** One id per request, reused from an upstream proxy if it already set one. */
function correlationId(req: NextRequest): string {
  return req.headers.get(CORRELATION_HEADER) || crypto.randomUUID();
}

interface RequestContext {
  cid: string;
  nonce: string;
  csp: string;
}

/** Stamp the security + correlation headers every response out of here carries. */
function decorate(res: NextResponse, ctx: RequestContext): NextResponse {
  res.headers.set(CORRELATION_HEADER, ctx.cid);
  res.headers.set(CSP_HEADER, ctx.csp);
  return res;
}

function jsonError(
  code: string,
  message: string,
  status: number,
  ctx: RequestContext,
): NextResponse {
  return decorate(
    NextResponse.json({ error: { code, message, correlationId: ctx.cid } }, { status }),
    ctx,
  );
}

function loginRedirect(req: NextRequest, ctx: RequestContext): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?callbackUrl=${encodeURIComponent(
    req.nextUrl.pathname + req.nextUrl.search,
  )}`;
  return decorate(NextResponse.redirect(url), ctx);
}

function sessionToken(req: NextRequest): string | undefined {
  const bearer = req.headers.get("authorization");
  return (
    req.cookies.get(SESSION_COOKIE)?.value ??
    (bearer?.startsWith("Bearer ") ? bearer.slice(7) : undefined)
  );
}

/**
 * Forward the request with the correlation id, the CSP nonce, and (when
 * present) a verified identity hint as headers — route handlers and server
 * components read these back via next/headers rather than re-decoding the
 * token, and every log line for this request can bind the same correlationId.
 * Next itself reads `Content-Security-Policy` off the forwarded request to
 * learn the nonce for its bootstrap <script>.
 */
function next(
  req: NextRequest,
  ctx: RequestContext,
  claims?: { sub: string; email: string },
): NextResponse {
  const headers = new Headers(req.headers);
  headers.set(CORRELATION_HEADER, ctx.cid);
  headers.set("x-pathname", req.nextUrl.pathname);
  headers.set(NONCE_HEADER, ctx.nonce);
  headers.set(CSP_HEADER, ctx.csp);
  if (claims) {
    headers.set("x-zekerflex-user-id", claims.sub);
    headers.set("x-zekerflex-user-email", claims.email);
  }
  return decorate(NextResponse.next({ request: { headers } }), ctx);
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;
  const nonce = generateNonce();
  const ctx: RequestContext = {
    cid: correlationId(req),
    nonce,
    csp: buildContentSecurityPolicy({ dev: IS_DEV, nonce }),
  };
  const rule = matchRouteRule(pathname);

  if (!rule) {
    // No specific role rule for this path: HTML pages (marketing, /login,
    // /register, …) and API routes that aren't explicitly public. Pages just
    // get the headers; unlisted API paths default-deny.
    if (!pathname.startsWith("/api/") || isPublicApiRoute(pathname)) {
      return next(req, ctx);
    }
    const claims = await decodeSession(sessionToken(req));
    if (!claims) {
      return jsonError("UNAUTHENTICATED", "Authentication required", 401, ctx);
    }
    return next(req, ctx, claims);
  }

  const claims = await decodeSession(sessionToken(req));

  if (!claims) {
    return rule.redirectOnDeny
      ? loginRedirect(req, ctx)
      : jsonError("UNAUTHENTICATED", "Authentication required", 401, ctx);
  }

  if (!hasAnyRole(claims, rule.roles)) {
    if (rule.redirectOnDeny) {
      // Authenticated but wrong role for this area: send them to the router
      // page, which forwards to the home screen for their actual role.
      const url = req.nextUrl.clone();
      url.pathname = "/start";
      url.search = "";
      return decorate(NextResponse.redirect(url), ctx);
    }
    return jsonError(
      "FORBIDDEN",
      `Requires one of: ${rule.roles.join(", ")}`,
      403,
      ctx,
    );
  }

  // Pass a verified identity hint + the pathname downstream (handlers and
  // layouts still re-validate; the pathname lets a layout skip its own gate
  // for e.g. the onboarding route it wraps).
  return next(req, ctx, claims);
}
