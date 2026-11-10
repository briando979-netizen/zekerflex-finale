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
  // tesseract.js (eigen OCR, lib/ocr/engine.ts) start een worker-thread uit zijn
  // eigen map en laadt wasm: niet bundelen, als gewoon pakket laten.
  // onnxruntime-node (gezichtscontrole, lib/kyc/gezicht) is een native pakket met een .node-bestand: ook niet bundelen.
  serverExternalPackages: ["ioredis", "ssh2", "tesseract.js", "tesseract.js-core", "onnxruntime-node", "onnxruntime-common"],
  // The RAG brain reads lib/rag/knowledge/*.md at runtime (lib/rag/corpus.ts) —
  // ship them with every server function, not only the routes that import them.
  // De OCR-worker en zijn hulppakketten worden via new Worker(pad) geladen, wat
  // de tracer niet ziet: expliciet meenemen in de standalone-build.
  outputFileTracingIncludes: {
    "/**": [
      "./lib/rag/knowledge/**/*.md",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/bmp-js/**/*",
      "./node_modules/idb-keyval/**/*",
      "./node_modules/is-url/**/*",
      "./node_modules/node-fetch/**/*",
      "./node_modules/whatwg-url/**/*",
      "./node_modules/tr46/**/*",
      "./node_modules/webidl-conversions/**/*",
      "./node_modules/regenerator-runtime/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/zlibjs/**/*",
      // onnxruntime-node kiest zijn .node-bestand met een berekend pad, dat de tracer niet ziet. Het pakket weegt
      // 294 MB omdat alle platformen erin zitten; alleen de JavaScript en de Linux x64-bestanden gaan mee.
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**/*",
      "./node_modules/onnxruntime-common/**/*",
    ],
  },
  experimental: {
    optimizePackageImports: ["date-fns"],
    serverActions: {
      bodySizeLimit: "2mb",
    },
    // Met middleware kapt Next elke request-body standaard af op 10 MB (stil,
    // alleen een waarschuwing in het log). Video's voor de video-editor (tot
    // 200 MB) en de Site-ontwerper (tot 80 MB) kwamen daardoor kapot binnen.
    // De routes zelf begrenzen de grootte per soort bestand.
    middlewareClientMaxBodySize: "210mb",
  },
  logging: {
    fetches: { fullUrl: false },
  },
  // De studio is gesplitst in /studio/website en /studio/webshop; de oude adressen
  // (bladwijzers, mails) lopen door naar de nieuwe plek. /studio/website zelf is nu
  // het overzicht van de website; de paginabouwer staat op /studio/website/bouwer.
  async redirects() {
    const naarWebshop = ["producten", "bestellingen", "klanten", "ontwerp", "instellingen", "verkopen", "verdienen"];
    return [
      ...naarWebshop.flatMap((d) => [
        { source: `/studio/${d}`, destination: `/studio/webshop/${d}`, permanent: false },
        { source: `/studio/${d}/:rest*`, destination: `/studio/webshop/${d}/:rest*`, permanent: false },
      ]),
      { source: "/studio/reserveringen", destination: "/studio/website/reserveringen", permanent: false },
    ];
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
          // Strict-Transport-Security zet Caddy, alleen op de eigen domeinen: deze
          // koppen gaan ook mee naar klantdomeinen (/site-domein/…) en HSTS met
          // includeSubDomains+preload hoort niet op het domein van een klant.
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
