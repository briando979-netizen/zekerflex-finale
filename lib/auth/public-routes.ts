// ---------------------------------------------------------------------------
// The explicit allowlist of API routes that may be called without a session.
// Everything else under /api/* is protected by default at the middleware
// layer (see middleware.ts) — a route can still be more restrictive on top
// (role/org/branch checks), but it can no longer be *less* protected than
// "must be logged in" just because it forgot to call requirePrincipal().
//
// Each entry here was individually verified to be either:
//   - genuinely public by design (marketing/public-facing forms, webhooks,
//     health checks, the public partner API), or
//   - authenticated by a DIFFERENT mechanism than the session cookie
//     (API keys for /api/public/v1/*, a shared secret for /api/internal/*).
// ---------------------------------------------------------------------------

const PUBLIC_PREFIXES = [
  "/api/auth", // NextAuth itself + check-email/check-password/generate-password (pre-signup helpers) + /api/auth/passkey (begin van inloggen met passkey: eenmalige challenge, IP-begrensd; lib/auth/passkey/inloggen.ts)
  "/api/register",
  "/api/webhooks", // signature-verified (Stripe, Didit)
  "/api/public", // partner API — its own API-key auth (verifyApiKey/requireApiKey)
  "/api/internal", // cron/scheduler — its own shared-secret auth (checkInternalToken)
  "/api/metrics", // Prometheus exposition — same shared-secret auth (checkInternalToken)
  "/api/health",
  "/api/ready",
  "/api/status",
  "/api/graphql", // auth + role checks live per-resolver, plus its own rate limiting
  "/api/chat", // public marketing chat widget + its own IP rate limiting
  "/api/demo", // public "book a demo" form + its .ics link
  "/api/afspraak", // public AI-concierge (bel)afspraak form + its own IP rate limiting
  "/api/telephony", // Twilio voice webhooks — X-Twilio-Signature validated (lib/telephony)
  "/api/whatsapp", // de WhatsApp-brug (deploy/whatsapp-brug) geeft antwoorden op spoedoproepen door: eigen gedeelde sleutel (WHATSAPP_BRUG_TOKEN)
  "/api/werken-bij", // public job application form
  "/api/kennis/whitepaper", // public whitepaper downloads
  "/api/mail/afmelden",
  "/api/mail/voorkeuren", // token-based, not session-based
  "/api/nieuwsbrief", // signup + its own /afmelden
  "/api/analytics/track", // anonymous visitor tracking, rate-limited by session id
  "/api/analytics/ping", // anonymous attention signals (time on page, tab away, leave), rate-limited
  "/api/companion", // owner's desktop Jarvis — its own personal-token auth (lib/companion)
  "/api/shop", // public storefront reads; writes are admin-gated inside the route
  "/api/betaal", // invoice pay link (QR on the PDF): HMAC-signed token + IP rate limit (lib/billing/pay-link.ts)
  "/api/client-error", // crash-boundary rapporteert client-side fouten (kan ook uitgelogd gebeuren); IP rate-limited
  "/api/website-check", // gratis website-check + aanvraagformulier; IP- en dagbegrenzing, alleen openbare adressen (lib/website-check/fetch.ts)
  "/api/review-scan", // gratis review-scan (Google Places) + aanvraagformulier; IP- en dagbegrenzing, rapport op niet te raden id (lib/review-scan/run.ts)
  "/api/deal", // voorstel op maat na een gratis scan: "bekeken" en "akkoord"; het niet te raden id is de sleutel, IP-begrensd (lib/scans/deal.ts)
  "/api/rekentools", // "stuur mij de uitkomst" op de openbare rekentools: IP-begrensd, verborgen anti-botveld, toestemming verplicht; rekent zelf opnieuw (lib/rekentools/uitkomst.ts)
  "/api/klus-plaatsen", // /klus-plaatsen: de openbare voorpagina van een bedrijf lezen om de klus in te vullen; IP- en dagbegrenzing, alleen openbare adressen, niets bewaard (app/api/klus-plaatsen/website)
  "/api/media/youtube", // eigen kopie van een YouTube-voorbeeldplaatje (klik-om-af-te-spelen video); alleen YouTube-ids, één vaste host, IP-begrensd
  "/api/kaart", // ZekerFlex Kaart: adres zoeken (PDOK, IP-begrensd) en luchtfoto-tegels (PDOK, alleen NL); alleen lezen, geen gegevens van gebruikers
  "/api/domeinen", // domeinnaam zoeken (alleen lezen, vaste RDAP-adressen) en aanvragen (toestemming verplicht, alleen van de eigen site); beide IP-begrensd (lib/domeinen)
  "/api/horeca/site", // horecasite: bestellen via de QR-code op tafel (IP-begrensd, tafelcode verplicht) en de bestelling volgen; elke route controleert zelf (lib/horeca). Het beheer (/api/horeca/beheer) blijft achter de ZekerFlex-login
  "/api/oidc", // "Inloggen met ZekerFlex" (lib/oidc): authorize eist zelf een sessie (anders naar /login), token en userinfo zijn voor de dienst (client-geheim / toegangstoken), jwks is openbaar
  "/api/horeca/bon", // de bon voor een gast: pdf of mail, alleen met een ondertekende link naar precies één betaalde bon; IP-begrensd, per bon hooguit 5 mails per dag (lib/horeca/bon.ts)
  "/api/horeca/scherm", // horeca-schermen (keuken, bar, handheld, …): alleen voor een gekoppeld apparaat met eigen ondertekend cookie of de beheerder; koppelen met een code van 15 min, IP-begrensd (lib/horeca/apparaten.ts)
  "/api/rijschool/site", // rijschoolsite: proefles (IP-begrensd), leerling- en instructeur-app met eigen sessie-cookie; elke route controleert zelf (lib/rijschool/accounts.ts). Het beheer (/api/rijschool/beheer) blijft achter de ZekerFlex-login
  "/api/rijschool/domein", // eigen domein van een rijschool: welke rijschool hoort bij een domein (alleen naam, online, hoofdadres; de middleware vraagt dit) en het https-bewijs op dat domein (lib/rijschool/domein.ts)
  "/api/voorstel/schwarzwald", // Schwarzwald-voorstel: agenda (IP-begrensd), klantaccount met eigen sessie-cookie, beheer (Schwarzwald-beheerder of PLATFORM_ADMIN) — elke route controleert zelf (lib/voorstel/schwarzwald-accounts.ts)
  "/api/review", // Google-reviews verzamelen: sterren, privébericht en de doorstuurlink naar Google van één verzoek; het niet te raden token is de sleutel, IP-begrensd (lib/review-requests/store.ts). /api/reviews (interne beoordelingen) valt hier niet onder
  "/api/netwerk/radius", // de RADIUS-server (wifi) vraagt per inlogpoging of iemand mag en welk geheim bij een IP hoort; eigen vaste sleutel NETWERK_RADIUS_TOKEN (lib/netwerk/token.ts). Het beheer (/api/werkgever/netwerk) blijft achter de login
  "/api/toegang", // het kastje bij de slagboom (kentekenherkenning) vraagt per auto of die mag en haalt open-opdrachten op; eigen token per vestiging (lib/locatie/toegang.ts), IP-begrensd. Het beheer (/api/werkgever/locatie) blijft achter de login
  "/api/printen/agent", // de printagent op een computer op locatie haalt de labelwachtrij op en meldt wat geprint is; eigen token per bedrijf (lib/locatie/printen.ts), IP-begrensd
  "/api/websitevoorstel", // websitevoorstel van sales: "bekeken" en het ja-formulier; het niet te raden id in de link is de sleutel, IP-begrensd (lib/sales/website-proposal.ts). Maken en beheren blijft achter de login (/api/admin/websitevoorstellen)
  "/api/agent/horeca", // AI-assistenten reserveren een tafel: alleen zaken die online staan met reserveren aan, dezelfde controle onder een slot als de eigen site, IP- en per-gast-begrensd; bekijken/annuleren alleen met de ondertekende annuleerlink (lib/horeca/agent-server.ts)
  "/api/terminal", // het incheckscherm bij de ingang (tablet zonder login): de sleutel in het adres is het bewijs, alleen als hash bewaard, IP-begrensd (lib/incheck/store.ts)
] as const;

const PUBLIC_EXACT = new Set<string>([
  "/api/company/search", // public KVK autocomplete — /api/company/lookup and /company/register require a session
  "/api/sites/domein-check", // Caddy's on-demand TLS "ask": says only whether a proven own domain of a published site exists
  "/api/indexnow-key", // IndexNow keyLocation: Bing/Yandex fetch it logged-out to verify site ownership; the key is public by design
]);

/** /api/orgs/<tenantId>/photo is public; /api/orgs and /api/orgs/photo are not. */
const ORG_PHOTO_PATTERN = /^\/api\/orgs\/[^/]+\/photo$/;

export function isPublicApiRoute(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (ORG_PHOTO_PATTERN.test(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
