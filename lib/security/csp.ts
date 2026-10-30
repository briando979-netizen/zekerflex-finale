// ---------------------------------------------------------------------------
// Content-Security-Policy, built per request in middleware.ts so `script-src`
// can carry a fresh nonce instead of 'unsafe-inline'.
//
// Production `script-src`:  'self' 'nonce-<n>' 'strict-dynamic'
//   - Next's inline bootstrap script is emitted with this nonce (Next reads it
//     back from the CSP response header set by the middleware).
//   - 'strict-dynamic' lets that trusted bootstrap pull in the /_next/static
//     chunks without an origin allowlist. Browsers that honour it ignore
//     'self' for scripts; older ones fall back to 'self', which still covers
//     the same-origin chunks.
//   - No 'unsafe-inline', no 'unsafe-eval'.
//
// Setting a nonce opts a route into dynamic rendering (the nonce can't be
// baked into static HTML). The marketing pages accept that cost; everything
// behind auth was already dynamic. See docs/PRODUCTION-READINESS.md.
//
// `style-src` keeps 'unsafe-inline': Next / styled-jsx inject inline <style>
// without a nonce and there is no first-class fix yet. Style injection is a
// far weaker vector than script injection, so this is a conscious stop here.
// ---------------------------------------------------------------------------

/** 16 random bytes, base64 — safe for a CSP nonce and an HTTP header value. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export interface CspOptions {
  /** `next dev` needs 'unsafe-inline' + 'unsafe-eval' for React Refresh / HMR. */
  dev: boolean;
  nonce: string;
  /**
   * Request pathname. Lets two admin-only routes relax the policy in a scoped,
   * documented way:
   *   - the ZekerFlex AI-studio (`/admin/zekerflex-ai`) frames same-origin pages
   *     for its live preview and a blob/sandbox document, and makes a best-effort
   *     attempt to embed external sites;
   *   - its sandbox sub-frame (`/admin/zekerflex-ai/sandbox-frame`) runs the
   *     author's own HTML/CSS/JS, so it needs inline + eval scripts. That frame
   *     is isolated by the iframe `sandbox` attribute (opaque origin, no access
   *     to the app), so the loose policy can't reach ZekerFlex itself.
   */
  pathname?: string | undefined;
}

export function buildContentSecurityPolicy({ dev, nonce, pathname }: CspOptions): string {
  const studio =
    pathname === "/admin/zekerflex-ai" || (pathname?.startsWith("/admin/zekerflex-ai/") ?? false);
  const sandboxFrame = pathname === "/admin/zekerflex-ai/sandbox-frame";

  const scriptSrc =
    dev || sandboxFrame
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  const connectSrc = dev
    ? "connect-src 'self' ws: http: https:"
    : "connect-src 'self' https://api.stripe.com";
  // Default: only Stripe's card iframe. The studio also frames 'self' (live
  // preview), blob: (sandbox) and best-effort external https: pages.
  const frameSrc = studio
    ? "frame-src 'self' blob: https:"
    : "frame-src https://js.stripe.com";
  // The sandbox shows arbitrary author markup; let pasted snippets load images
  // from anywhere. It stays isolated by the iframe `sandbox` attribute.
  const imgSrc = sandboxFrame ? "img-src * data: blob:" : "img-src 'self' data: blob:";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    imgSrc,
    "media-src 'self' blob:",
    connectSrc,
    // The service worker (/sw.js) — 'strict-dynamic' would otherwise drop the
    // 'self' fallback for worker scripts and block it.
    "worker-src 'self'",
    frameSrc,
    "manifest-src 'self'",
    // 'self' (not 'none'): the app frames its own pages in the ZekerFlex
    // AI-studio's live preview. 'self' still blocks every cross-origin framer,
    // so clickjacking protection is intact.
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
