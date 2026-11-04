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

/** Our own public origin (from APP_BASE_URL); the middleware runs on the edge, so read it directly. */
const SITE_ORIGIN = (() => {
  try {
    return new URL(process.env.APP_BASE_URL ?? "https://zekerflex.com").origin;
  } catch {
    return "https://zekerflex.com";
  }
})();

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

/**
 * Het voorbeeld van de website-verhuizer (/website-preview/<id>/…) toont de
 * gekopieerde site van een klant, met zijn eigen scripts. `sandbox` zonder
 * allow-same-origin geeft die pagina een eigen, lege herkomst: geen toegang tot
 * cookies of opslag van zekerflex.com, en verzoeken naar onze API gaan als
 * vreemde site zonder sessie. Formulieren versturen kan niet (form-action 'none').
 */
export const SITE_PREVIEW_CSP = [
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox",
  "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "object-src 'none'",
].join("; ");

/**
 * Websites die ZekerFlex voor klanten host (/site/<naam>/…). De pagina's
 * bevatten geen scripts (lib/sites/render.ts) en krijgen hier ook geen enkel
 * script: `sandbox` zonder allow-scripts en allow-same-origin geeft ze een eigen
 * lege herkomst, dus geen toegang tot cookies of de API van zekerflex.com.
 * Alleen eigen foto's, stijlen en lettertypes (de premium-stijl haalt die van
 * de site zelf, lib/sites/serve.ts); formulieren alleen naar de site zelf.
 * `origin` staat er naast 'self' omdat browsers 'self' in een sandbox
 * verschillend uitleggen.
 */
export function siteHostCsp(origin: string): string {
  return [
    "sandbox allow-forms allow-popups allow-popups-to-escape-sandbox",
    "default-src 'none'",
    `img-src 'self' ${origin} data:`,
    `style-src 'self' ${origin} 'unsafe-inline'`,
    `font-src 'self' ${origin}`,
    `form-action 'self' ${origin}`,
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Een chatbijlage die los geopend wordt (een foto in een nieuw tabblad,
 * /api/inbox/<gesprek>/media/<id>): geen script, een eigen lege herkomst en
 * niets inladen. Het bestand zelf toont gewoon.
 */
export const CHAT_MEDIA_CSP = ["sandbox", "default-src 'none'", "style-src 'unsafe-inline'", "frame-ancestors 'self'"].join("; ");

export function buildContentSecurityPolicy({ dev, nonce, pathname }: CspOptions): string {
  if (pathname?.startsWith("/website-preview/")) return SITE_PREVIEW_CSP;
  if (pathname === "/site" || pathname?.startsWith("/site/")) return siteHostCsp(SITE_ORIGIN);
  // Own domains get their CSP from the middleware (customerSite); typed by hand on zekerflex.com this path only 404s.
  if (pathname?.startsWith("/site-domein/")) return siteHostCsp(SITE_ORIGIN);
  if (pathname && /^\/api\/inbox\/[^/]+\/media\/[^/]+$/.test(pathname)) return CHAT_MEDIA_CSP;
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
  // Default: Stripe's card iframe and the YouTube player in privacy mode, which
  // only loads after a click (components/ui/YouTubeEmbed.tsx). The studio also
  // frames 'self' (live preview), blob: (sandbox) and best-effort external https: pages.
  // The Site-ontwerper (/admin/ontwerper) shows the own site in a same-origin preview frame.
  const ontwerper = pathname === "/admin/ontwerper" || (pathname?.startsWith("/admin/ontwerper/") ?? false);
  const frameSrc = studio
    ? "frame-src 'self' blob: https:"
    : ontwerper
      ? "frame-src 'self' https://www.youtube-nocookie.com"
      : "frame-src https://js.stripe.com https://www.youtube-nocookie.com";
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
