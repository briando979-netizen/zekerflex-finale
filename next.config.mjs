/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lean, self-contained build for the production Docker image (deploy/).
  // Harmless for local `next dev` / `next start`.
  output: "standalone",
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2678400,
  },
  // Keep native / Node-only packages out of the RSC bundle (stable in Next 15).
  serverExternalPackages: ["ioredis"],
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
    ];
  },
};

export default nextConfig;
