/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lean, self-contained build for the production Docker image (deploy/).
  // Harmless for local `next dev` / `next start`.
  output: "standalone",
  compress: true,
  images: {
    // Alleen WebP: AVIF-omzetting liep op de VPS blijvend vast (2 nov 2026: elke
    // volgende aanvraag voor die foto wachtte eeuwig op de eerste) en kost veel CPU.
    formats: ["image/webp"],
    // Local images may carry a cache-busting ?v= (marketing photos) — allow it.
    localPatterns: [{ pathname: "/**" }],
    minimumCacheTTL: 2678400,
  },
  // Keep native / Node-only packages out of the RSC bundle (stable in Next 15).
  // ssh2 laadt optionele native modules (cpu-features, sshcrypto) die webpack niet moet bundelen.
  serverExternalPackages: ["ioredis", "ssh2"],
  // The RAG brain reads lib/rag/knowledge/*.md at runtime (lib/rag/corpus.ts) —
  // ship them with every server function, not only the routes that import them.
  outputFileTracingIncludes: {
    "/**": ["./lib/rag/knowledge/**/*.md"],
  },
  experimental: {
    optimizePackageImports: ["date-fns"],
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  logging: {
    fetches: { fullUrl: false },
  },
  async headers() {
    // The Content-Security-Policy is set per request in middleware.ts so
    // `script-src` can carry a fresh nonce instead of 'unsafe-inline'
    // (lib/security/csp.ts). Everything below is request-independent and stays
    // here as a static header.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(self), geolocation=(self), display-capture=(self), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // The service worker must be revalidated on every load (so a new
        // sw.js ships immediately) and allowed to control the whole origin.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "text/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
      {
        // Self-hosted fonts (app/fonts.css): the file names carry a content hash,
        // so they may be cached for good, as next/font's own files were.
        source: "/fonts/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Photos and the hero video of the proposal sites (public/voorstel). Without
        // this every visit re-downloaded the 6 MB video (max-age=0). The names carry
        // no hash, so cache a day and revalidate in the background, not immutable.
        source: "/voorstel/:pad*/:bestand.:ext(webp|png|jpg|jpeg|svg|mp4)",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
