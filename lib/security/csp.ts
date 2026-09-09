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
}

export function buildContentSecurityPolicy({ dev, nonce }: CspOptions): string {
  const scriptSrc = dev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  const connectSrc = dev
    ? "connect-src 'self' ws: http: https:"
    : "connect-src 'self'";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    connectSrc,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
