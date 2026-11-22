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
      // 16 nov: het eigen 5G-netwerk staat niet meer in het aanbod (vergunning en apparatuur per terrein, owner-todo)
      { source: "/aanbod/eigen-5g-netwerk", destination: "/aanbod", permanent: true },
      // 21 nov: de oude pagina over ZekerFlex als uitzender is weg (eigenaar: "haal dit per direct weg"); oude links gaan naar
      // de nieuwe uitleg /starten-als-uitzendkracht (werken via een uitzendbureau, in de app). Tijdelijk (307).
      { source: "/uitzendbureau", destination: "/starten-als-uitzendkracht", permanent: false },
      // 22 nov 2026 (eigenaar: "verwijder de shop en apps enzo, we zijn voor zzp, uitzend en flexwerk gegaan"): de oude
      // verkooppagina's (apps en spelletjes, websites, rijschool-software, partnerplatform, producten en de aanbodpagina's van
      // de pijlers online en branche) sturen door naar de flexwerkpagina voor bedrijven, de apps naar de ZekerFlex-app.
      // Tijdelijk (307), zodat het terug kan. Ook de hulpmiddelen website-check, review-check, logo-maker, advertentie op maat,
      // domeinnaam en abonnementen: gemeten op 22 nov had geen enkel echt bedrijf ze ooit gebruikt of ervoor betaald (alleen
      // test- en eigen accounts), dus de eigenaar koos "gooi weg". /aanbod (overzicht met alleen flexwerk) en de
      // personeel/geld-functiepagina's blijven, net als de klantsites (/site, /site-domein).
      // Alleen exacte paden of paginapaden zonder punt: foto's in public/aanbod, public/voorbeeldsites en
      // public/rijschool-software blijven gewoon laden. De webshop stuurt al zelf door (app/shop/layout.tsx).
      ...[
        ["/apps", "/app"],
        ["/apps/:id", "/app"],
        ["/apps-en-spelletjes", "/app"],
        ["/online", "/voor-bedrijven"],
        ["/website-maken", "/voor-bedrijven"],
        ["/rijschool-software", "/voor-bedrijven"],
        ["/verkopen", "/voor-bedrijven"],
        ["/verkopen/:rest*", "/voor-bedrijven"],
        ["/producten", "/voor-bedrijven"],
        ["/producten/:slug", "/voor-bedrijven"],
        ["/starters", "/voor-bedrijven"],
        ["/voorbeeldsites", "/voor-bedrijven"],
        ["/nieuwe-home", "/"],
        ["/website-check", "/voor-bedrijven"],
        ["/review-check", "/voor-bedrijven"],
        ["/logo-maker", "/voor-bedrijven"],
        ["/logo-maker/:id", "/voor-bedrijven"],
        ["/advertentie-op-maat", "/voor-bedrijven"],
        ["/advertentie-op-maat/:id", "/voor-bedrijven"],
        ["/domeinnaam", "/voor-bedrijven"],
        ["/abonnementen", "/voor-bedrijven"],
        // de aanbodpagina's van de pijlers online en branche (lib/marketing/aanbod.ts); personeel en geld blijven
        ...["website", "webshop", "domeinnaam", "website-check", "advertentie-op-maat", "logo-maker", "starters", "review-check", "google-reviews", "telefonie", "zakelijke-mail", "horeca", "rijschool"].map((s) => [`/aanbod/${s}`, "/voor-bedrijven"]),
      ].map(([van, naar]) => ({ source: van, destination: naar, permanent: false })),
      // Browsers, pdf-viewers en de linkvoorvertoning van Apple vragen deze vaste adressen in de root, ook al staat het
      // pictogram in de pagina-kop (13 nov: 17× /favicon.ico en 7× een apple-touch-icon als 404 in 2 dagen)
      { source: "/favicon.ico", destination: "/icons/icon-192.png", permanent: true },
      { source: "/apple-touch-icon.png", destination: "/icons/apple-touch-icon.png", permanent: true },
      { source: "/apple-touch-icon-precomposed.png", destination: "/icons/apple-touch-icon.png", permanent: true },
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
      {
        // Het SmileyApp-voorstel hoort niet in zoekmachines, ook niet via zekerflex.com/voorstel/smileyapp
        // (op smileyapp.zekerflex.com zet de middleware deze kop op elk antwoord, voorstelSite()).
        source: "/voorstel/smileyapp/:pad*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // Foto's van de eigen site (paginacheck 15 nov): ook die kwamen met max-age=0, dus elk bezoek vroeg ze opnieuw
        // op (bv. /shifts/logistiek.jpg, 221 kB, op / en /bedrijven). Alleen bestanden met een beeld-extensie, nooit een
        // pagina zoals /shop/<product>. Geen hash in de naam: een dag bewaren, op de achtergrond verversen.
        source: "/:map(marketing|paskamer|shop|shifts|chat-stickers|werk|icons|aanbod|welkom|voorbeeldsites|sites|videos)/:pad*/:bestand.:ext(webp|png|jpg|jpeg|svg|gif|avif|mp4|webm)",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
