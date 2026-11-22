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
  "/api/demo", // public "book a demo" form + its .ics link; /api/demo/telefoon = luisterdemo van de telefoonassistent (eigen herkomst, IP- en dagbegrensd, botveld, hooguit 2 tegelijk; lib/telephony/demo-server.ts)
  "/api/afspraak", // public AI-concierge (bel)afspraak form + its own IP rate limiting
  "/api/telephony", // Twilio voice webhooks — X-Twilio-Signature validated (lib/telephony)
  "/api/whatsapp", // de WhatsApp-brug (deploy/whatsapp-brug) geeft antwoorden op spoedoproepen door: eigen gedeelde sleutel (WHATSAPP_BRUG_TOKEN)
  "/api/werken-bij", // public job application form
  "/api/kennis/whitepaper", // public whitepaper downloads
  "/api/mail/afmelden",
  "/api/mail/voorkeuren", // token-based, not session-based
  "/api/nieuwsbrief", // signup + its own /afmelden
  "/api/app/tester", // tester worden voor de Android-app (21 nov 2026): alleen een e-mailadres op een lijst, eigen IP-limiet
  "/api/analytics/track", // anonymous visitor tracking, rate-limited by session id
  "/api/analytics/taal-vraag", // anonieme telling per taalcode uit Accept-Language, zonder IP of gebruiker (lib/i18n/taal-vraag.ts)
  "/api/analytics/ping", // anonymous attention signals (time on page, tab away, leave), rate-limited
  "/api/companion", // owner's desktop Jarvis — its own personal-token auth (lib/companion)
  "/api/shop", // public storefront reads; writes are admin-gated inside the route (de webshop zelf is sinds 22 nov 2026 weg; Beheer, de bon en de voorraadmelding gebruiken dit nog)
  "/api/betaal", // invoice pay link (QR on the PDF): HMAC-signed token + IP rate limit (lib/billing/pay-link.ts)
  "/api/client-error", // crash-boundary rapporteert client-side fouten (kan ook uitgelogd gebeuren); IP rate-limited
  "/api/review-scan", // gratis review-scan (Google Places) + aanvraagformulier; IP- en dagbegrenzing, rapport op niet te raden id (lib/review-scan/run.ts)
  "/api/advertentie", // advertentie op maat (/advertentie-op-maat): maken, de beelden en "Deze wil ik". Het niet te raden id (128 bit) is de sleutel; de beeldroute geeft vóór vrijgave alleen een klein beeld met ingebakken watermerk (lib/advertentie/regels.ts beeldBesluit), IP-begrensd met 429. Vrijgeven en beheren blijft achter de login (/api/admin/advertentie-op-maat)
  "/api/logo-maker", // logo maker (/logo-maker): maken, de beelden en "Deze wil ik", zelfde opzet als /api/advertentie. Het niet te raden id (128 bit) is de sleutel; de beeldroute geeft vóór vrijgave alleen een klein beeld met ingebakken watermerk (lib/logo/regels.ts logoBesluit), IP-begrensd met 429. Vrijgeven en beheren blijft achter de login (/api/admin/advertentie-op-maat)
  "/api/deal", // voorstel op maat na een gratis scan: "bekeken" en "akkoord"; het niet te raden id is de sleutel, IP-begrensd (lib/scans/deal.ts)
  "/api/rekentools", // "stuur mij de uitkomst" op de openbare rekentools: IP-begrensd, verborgen anti-botveld, toestemming verplicht; rekent zelf opnieuw (lib/rekentools/uitkomst.ts)
  "/api/klus-plaatsen", // /klus-plaatsen: de openbare voorpagina van een bedrijf lezen om de klus in te vullen; IP- en dagbegrenzing, alleen openbare adressen, niets bewaard (app/api/klus-plaatsen/website); /via telt alleen een maandtotaal van de tip van een werker (geen persoon, geen adres)
  "/api/media/youtube", // eigen kopie van een YouTube-voorbeeldplaatje (klik-om-af-te-spelen video); alleen YouTube-ids, één vaste host, IP-begrensd
  "/api/kaart", // ZekerFlex Kaart: adres zoeken (PDOK, IP-begrensd), luchtfoto-tegels (PDOK, alleen NL) en route plannen (onze eigen routeplanner, IP-begrensd, alleen NL, niets bewaard); alleen lezen, geen gegevens van gebruikers
  "/api/domeinen", // domeinnaam zoeken (alleen lezen, vaste RDAP-adressen) en aanvragen (toestemming verplicht, alleen van de eigen site); beide IP-begrensd (lib/domeinen)
  "/api/oidc", // "Inloggen met ZekerFlex" (lib/oidc): authorize eist zelf een sessie (anders naar /login), token en userinfo zijn voor de dienst (client-geheim / toegangstoken), jwks is openbaar
  "/api/netwerk/radius", // de RADIUS-server (wifi) vraagt per inlogpoging of iemand mag en welk geheim bij een IP hoort; eigen vaste sleutel NETWERK_RADIUS_TOKEN (lib/netwerk/token.ts). Het beheer (/api/werkgever/netwerk) blijft achter de login
  "/api/toegang", // het kastje bij de slagboom (kentekenherkenning) vraagt per auto of die mag en haalt open-opdrachten op; eigen token per vestiging (lib/locatie/toegang.ts), IP-begrensd. Het beheer (/api/werkgever/locatie) blijft achter de login
  "/api/printen/agent", // de printagent op een computer op locatie haalt de labelwachtrij op en meldt wat geprint is; eigen token per bedrijf (lib/locatie/printen.ts), IP-begrensd
  "/api/id-overdracht", // "verder op je telefoon": de telefoon (niet ingelogd) opent, laat lezen en levert de foto's in met een eenmalige code van 20 min (in de body, IP-begrensd; lib/kyc/overdracht.ts). Starten en de stand bekijken (/api/onboarding/overdracht) blijft achter de login
  "/api/chip", // de Android-app leest de chip van paspoort/ID-kaart: sleutel ophalen en uitslag sturen met een eenmalige code (10 min, in de body, IP-begrensd; lib/kyc/chip/sessie.ts). Starten en de uitslag bekijken (/api/onboarding/chip) blijft achter de login
  "/api/installatie", // een klant volgt de monteur en de monteur zet zijn stap en positie: de code in het adres (id plus handtekening per rol, lib/installatie/store.ts) is de sleutel, IP- en per-afspraak-begrensd, nooit gelogd. Afspraken maken en beheren (/api/admin/installaties) blijft achter de login
  "/api/terminal", // het incheckscherm bij de ingang (tablet zonder login): de sleutel in het adres is het bewijs, alleen als hash bewaard, IP-begrensd (lib/incheck/store.ts)
  "/api/partner-lead", // aanvraagformulier voor partnerpakketten op de openbare pagina's (lib/products.ts): gevalideerd, IP-begrensd, maakt een lead; 14 nov 2026 gaf dit een 401 voor bezoekers zonder account
  "/api/uitzendbureau", // contactformulier op /voor-bureaus: gevalideerd, IP-begrensd, maakt een lead; zelfde gat als /api/partner-lead
  "/api/sales-partner", // aanmeldformulier op /sales-partner: gevalideerd, IP-begrensd, maakt een lead; zelfde gat als /api/partner-lead
] as const;

const PUBLIC_EXACT = new Set<string>([
  "/api/company/search", // public KVK autocomplete — /api/company/lookup and /company/register require a session
  "/api/indexnow-key", // IndexNow keyLocation: Bing/Yandex fetch it logged-out to verify site ownership; the key is public by design
]);

/** /api/orgs/<tenantId>/photo is public; /api/orgs and /api/orgs/photo are not. */
const ORG_PHOTO_PATTERN = /^\/api\/orgs\/[^/]+\/photo$/;

export function isPublicApiRoute(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (ORG_PHOTO_PATTERN.test(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
