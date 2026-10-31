import { NextResponse, type NextRequest } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { hasAnyRole, matchRouteRule } from "@/lib/auth/rbac";
import { isPublicApiRoute } from "@/lib/auth/public-routes";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/security/csp";
import { prefersMarkdown } from "@/lib/http/accept";
import { markdownFor } from "@/lib/agent-content/markdown-pages";
import { APP_COOKIE, isAppBlockedPath } from "@/lib/app-mode";
import { INSPECT_PARAM, INSPECT_SESSION_SECONDS, inspectSessionFor, verifyInspectLink, VIEW_AS_COOKIE } from "@/lib/auth/inspect";

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
  const res = decorate(NextResponse.redirect(url), ctx);
  // loginRedirect komt alleen hier als er GEEN geldige sessie is. Staat er dan
  // toch een sessie-cookie in de request, dan is die niet (meer) te decoderen
  // (oud AUTH_SECRET / restant van een vorige deploy). Ruim 'm actief op, anders
  // blijft de browser die kapotte cookie sturen → login-lus (telkens teruggestuurd
  // naar /login ondanks inloggen). Een geldige sessie bereikt dit nooit.
  if (req.cookies.get(SESSION_COOKIE)) {
    res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: !IS_DEV });
  }
  return res;
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

// ---------------------------------------------------------------------------
// Android app (TWA) mode: the app always launches /start?utm_source=twa, which
// sets APP_COOKIE. With it, the public marketing site is off-limits — any page
// outside APP_ALLOWED bounces to /start (→ login or your own dashboard). Legal
// pages Google Play requires, the shop and the kennisbank (linked from the
// dashboards) stay reachable; the bank pages are blocked (lib/app-mode.ts).
// /?app=0 leaves app mode.
// ---------------------------------------------------------------------------
const APP_ALLOWED = [
  "/start", "/login", "/register", "/wachtwoord-vergeten", "/wachtwoord-herstellen", "/verifieer-email",
  "/dashboard", "/werkgever", "/admin", "/sales", "/berichten", "/betaal", "/betaalverzoek", "/kyc", "/r", "/uitnodiging",
  "/account-verwijderen", "/gegevens-verwijderen", "/privacy", "/voorwaarden", "/cookiebeleid", "/mail", "/nieuwsbrief/afmelden",
  "/shop", "/kennis", "/offline",
];

function isAppLaunch(req: NextRequest): boolean {
  return (
    (req.nextUrl.pathname === "/start" && req.nextUrl.searchParams.get("utm_source") === "twa") ||
    (req.headers.get("referer") ?? "").startsWith("android-app://com.zekerflex")
  );
}

function appAllowed(pathname: string): boolean {
  return APP_ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function middleware(req: NextRequest): Promise<NextResponse> {
  // Admin "Bekijk als": outside the admin area, serve as the chosen example
  // account (read-only). /admin and /api/admin keep the admin's own session.
  const viewAs = req.cookies.get(VIEW_AS_COOKIE)?.value;
  const p = req.nextUrl.pathname;
  if (viewAs && !p.startsWith("/admin") && !p.startsWith("/api/admin")) {
    const claims = await decodeSession(viewAs);
    if (claims?.inspect) {
      req.cookies.set(SESSION_COOKIE, viewAs);
      req.headers.delete("authorization");
    }
  }

  // Read-only inspection sessions (lib/auth/inspect.ts) may never write.
  if (!READ_METHODS.has(req.method)) {
    const claims = await decodeSession(sessionToken(req));
    if (claims?.inspect) {
      return NextResponse.json(
        { error: { code: "READ_ONLY", message: "Inspectiemodus is alleen-lezen — hier kan niets worden opgeslagen." } },
        { status: 403 },
      );
    }
  }

  // ?zf_inspect=<link> — serve this request as the link's test account, read-only.
  let inspectSession: string | null = null;
  const inspectApp = req.nextUrl.searchParams.get("app");
  const link = req.nextUrl.searchParams.get(INSPECT_PARAM);
  if (link && READ_METHODS.has(req.method)) {
    const target = await verifyInspectLink(link);
    if (target) {
      inspectSession = await inspectSessionFor(target);
      // Replace whatever session the browser carries, so an admin opening
      // the link never sees their own account by accident.
      req.cookies.set(SESSION_COOKIE, inspectSession);
      req.headers.delete("authorization");
      if (inspectApp === "1") req.cookies.set(APP_COOKIE, "1");
    }
  }

  const res = await handle(req);
  const pathname = req.nextUrl.pathname;
  if (inspectSession) {
    res.cookies.set(SESSION_COOKIE, inspectSession, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: !IS_DEV,
      maxAge: INSPECT_SESSION_SECONDS,
    });
    if (inspectApp === "1") {
      res.cookies.set(APP_COOKIE, "1", { path: "/", maxAge: INSPECT_SESSION_SECONDS, sameSite: "lax", secure: !IS_DEV });
    }
  }
  if (pathname.startsWith("/api/")) return res;
  if (req.nextUrl.searchParams.get("app") === "0") {
    res.cookies.delete(APP_COOKIE);
  } else if (isAppLaunch(req) && !req.cookies.get(APP_COOKIE)) {
    res.cookies.set(APP_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: !IS_DEV });
  }
  return res;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;

  if (
    !pathname.startsWith("/api/") &&
    req.cookies.get(APP_COOKIE)?.value === "1" &&
    req.nextUrl.searchParams.get("app") !== "0" &&
    (!appAllowed(pathname) || isAppBlockedPath(pathname))
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/start";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Markdown content negotiation: an agent sending `Accept: text/markdown`
  // gets the real Markdown rendering for the handful of pages that have one
  // (see lib/agent-content/markdown-pages.ts), instead of the normal HTML.
  // The HTML branch falls through to Next's own page rendering below, whose
  // framework-level Vary header (rsc, next-router-state-tree, …) can't be
  // amended from middleware — Next overwrites whatever Vary middleware sets
  // once the page actually renders. Not needed here anyway: this is a
  // genuinely different response (Markdown, 200) for this one request, not a
  // cache-variant of the same page.
  const markdown = markdownFor(pathname);
  if (markdown !== null) {
    if (prefersMarkdown(req.headers.get("accept"))) {
      return new NextResponse(markdown, {
        status: 200,
        headers: { "Content-Type": "text/markdown; charset=utf-8", Vary: "Accept" },
      });
    }
  }

  const nonce = generateNonce();
  const ctx: RequestContext = {
    cid: correlationId(req),
    nonce,
    csp: buildContentSecurityPolicy({ dev: IS_DEV, nonce, pathname }),
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
