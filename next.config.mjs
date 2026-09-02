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
  experimental: {
    optimizePackageImports: ["date-fns"],
    serverActions: {
      bodySizeLimit: "2mb",
    },
    // Keep native / Node-only packages out of the RSC bundle.
    serverComponentsExternalPackages: ["ioredis", "firebase-admin"],
  },
  logging: {
    fetches: { fullUrl: false },
  },
  async headers() {
    const dev = process.env.NODE_ENV !== "production";
    // Next's App Router injects small inline bootstrap scripts without a nonce, so
    // 'unsafe-inline' is required. `next dev` (React Refresh / HMR) additionally
    // needs 'unsafe-eval'; the production bundle does not, so it stays strict.
    const scriptSrc = dev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";
    const connectSrc = dev ? "connect-src 'self' ws: http: https:" : "connect-src 'self'";
    const csp = [
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
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
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
    ];
  },
};

export default nextConfig;
