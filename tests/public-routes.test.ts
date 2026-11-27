import { describe, expect, it } from "vitest";
import { isPublicApiRoute } from "@/lib/auth/public-routes";

// ---------------------------------------------------------------------------
// The allowlist middleware.ts uses to decide which /api/* routes may be
// called without a session. Getting an entry wrong in either direction is
// bad: too generous silently reopens exactly the class of bug this default-
// deny change exists to close; too strict breaks a real public flow (signup,
// webhooks, the partner API). These tests pin both directions down.
// ---------------------------------------------------------------------------

describe("isPublicApiRoute — allowed", () => {
  const cases = [
    "/api/auth/session",
    "/api/auth/check-email",
    "/api/register",
    "/api/webhooks/stripe",
    "/api/webhooks/didit",
    "/api/public/v1/shifts",
    "/api/internal/matching/tick",
    "/api/internal/boekhouding/bonnen-mail", // cron: bonnetjes uit de Postvak (eigen token via checkInternalToken)
    "/api/internal/boekhouding/nachtronde", // cron: nachtelijke boekhoudronde (eigen token via checkInternalToken)
    "/api/partner-lead", // openbaar aanvraagformulier (bezoeker zonder account)
    "/api/uitzendbureau", // openbaar contactformulier /voor-bureaus
    "/api/sales-partner", // openbaar aanmeldformulier
    "/api/health",
    "/api/ready",
    "/api/status",
    "/api/graphql",
    "/api/chat",
    "/api/chat/rate",
    "/api/demo",
    "/api/demo/abc123/ics",
    "/api/afspraak",
    "/api/werken-bij",
    "/api/kennis/whitepaper/omzetbelasting",
    "/api/mail/afmelden",
    "/api/mail/voorkeuren",
    "/api/nieuwsbrief",
    "/api/app/tester",
    "/api/nieuwsbrief/afmelden",
    "/api/analytics/track",
    "/api/klus-plaatsen/via", // /klus-plaatsen?via=werker: alleen een telling per maand, openbaar en IP-begrensd (valt onder het voorvoegsel /api/klus-plaatsen)
    "/api/klus-plaatsen/aanvraag", // /klus-plaatsen "wij zetten je klus online": naam + telefoon of e-mail, IP- en dagbegrensd, eigen site, botveld (lib/klusconcept/aanvraag.ts)
    "/api/analytics/taal-vraag",
    "/api/shop/products",
    "/api/shop/media/abc123",
    "/api/shop/voorraadmelding/afmelden", // afmelden met de getekende link uit de bevestigingsmail (lib/shop/voorraadmelding.ts)
    "/api/shop/voorraadmelding", // "Laat me weten als hij er weer is": alleen een e-mailadres bij een uitverkochte maat, IP-begrensd (lib/shop/voorraadmelding.ts)
    "/api/shop/orders/abc123/beoordeling", // een koper beoordeelt zijn aankoop: alleen met het getekende token van de bestelling (lib/shop/beoordeling.ts)
    "/api/company/search",
    "/api/terminal/abc123-sleutel",
    "/api/kaart/zoek", // ZekerFlex Kaart: adres zoeken (PDOK), IP-begrensd
    "/api/kaart/route", // ZekerFlex Kaart: route plannen via onze eigen routeplanner, IP-begrensd
    "/api/chip/sleutel", // the Android app opens the ID chip with a one-time code
    "/api/chip/klaar",
    "/api/id-overdracht/open", // the phone (not logged in) continues the ID scan with a one-time code
    "/api/id-overdracht/lezen",
    "/api/id-overdracht/klaar",
    "/api/id-overdracht/document-live", // de camera op de telefoon meet het kader live (code in de body, IP-begrensd)
    "/api/whatsapp/inkomend",
    "/api/telephony/gather", // Twilio; elke telefonieroute controleert X-Twilio-Signature
    "/api/telephony/gather/vervolg", // Twilio komt hier na "een ogenblik" (<Redirect>), zelfde handtekening
    "/api/orgs/org_babycare/photo",
    "/api/media/youtube/dQw4w9WgXcQ", // our copy of a YouTube thumbnail
    "/api/indexnow-key", // IndexNow verifies site ownership without a session
    "/api/rekentools/uitkomst", // "stuur mij de uitkomst" on the public rekentools
    "/api/auth/werkgever", // /klus-plaatsen: is the caller's own session a werkgever? (yes/no only)
    "/api/auth/passkey", // begin van inloggen met passkey: eenmalige challenge, IP-begrensd (zonder sessie, je logt juist in)
    "/api/auth/callback/passkey", // NextAuth: de passkey-provider zelf (controleert challenge, handtekening en account)
    "/api/klus-plaatsen/website", // /klus-plaatsen reads a company's public front page
    "/api/domeinen/zoek", // is a domain name still free (public RDAP)
    "/api/domeinen/aanvraag", // request a domain / transfer
    "/api/oidc/authorize", // "Inloggen met ZekerFlex": the route itself sends a guest to /login
    "/api/oidc/token", // the service exchanges the code with its client secret
    "/api/oidc/jwks", // public signing key
    "/api/toegang/kenteken", // the barrier box asks whether a plate may enter (own token per branch)
    "/api/toegang/opdrachten", // the barrier box polls for manual open commands
    "/api/printen/agent", // the print agent fetches the label queue (own token per company)
    "/api/community/foto/oabc123def4/fabc123def4567.webp", // a photo of a visible community post
    "/api/community/avatar/oabc123def4/o", // the profile photo next to a visible community post
    "/api/community/melden", // the report button (DSA), also without an account, IP-limited
  ];
  it.each(cases)("%s is public", (path) => {
    expect(isPublicApiRoute(path)).toBe(true);
  });
});

describe("isPublicApiRoute — protected (must NOT be public)", () => {
  const cases = [
    "/api/werkgever/locatie", // Op locatie: the employer board stays behind the login
    "/api/onboarding/chip/start", // starting a chip read needs the worker's session
    "/api/onboarding/chip/status",
    "/api/onboarding/overdracht", // starting a hand-off to the phone needs the worker's session
    "/api/onboarding/document-lezen",
    "/api/onboarding/gezicht-live", // live face guidance during the ID scan: the worker's session only
    "/api/onboarding/document-live", // live document guidance (code readable, photo size): the worker's session only
    "/api/locatie/portofoon", // radio channels: session only
    "/api/me/kluis", // a worker's access codes: session only
    "/api/me/passkeys", // passkeys toevoegen/verwijderen: alleen met een sessie (en opnieuw bevestigen)
    "/api/printen/wachtrij", // only /api/printen/agent is public, not anything else under /api/printen
    "/api/company/lookup", // shares the /api/company prefix with the public search route
    "/api/company/register",
    "/api/orgs", // bare collection route
    "/api/orgs/photo", // the CALLER's own org photo — needs a session to know who's calling
    "/api/invoices/inv_1/checkout",
    "/api/me/documents/doc_1",
    "/api/me/certificates",
    "/api/uploads/upl_1",
    "/api/admin/mail",
    "/api/admin/shop/beoordelingen", // beoordelingen nakijken: alleen platformbeheerders
    "/api/admin/boekhouding/bonnen", // de bonnen van de boekhouding: alleen platformbeheerders
    "/api/admin/boekhouding/bonnen/abc123def456/bestand",
    "/api/werkgever/claims/claim_1",
    "/api/timesheets/ts_1/submit",
    "/api/people/search",
    "/api/geo/reverse", // het dichtstbijzijnde adres bij een punt: alleen met een sessie
    "/api/geo/search", // alleen met een sessie; /api/geo is niet als geheel openbaar aangemerkt
    "/api/calls/incoming",
    "/api/werkgever/sites/domain",
    "/api/werkgever/netwerk",
    "/api/netwerk",
    "/api/netwerk/iets-anders",
    // de wifi-server (RADIUS) is weg (22 nov 2026): zijn oude adressen staan niet meer open
    "/api/netwerk/radius/authorize",
    "/api/netwerk/radius/client",
    "/api/indexnow-key/extra", // exact match only
    "/api/rijschool/beheer", // the driving-school admin stays behind the ZekerFlex login
    "/api/horeca/beheer", // the horeca admin stays behind the ZekerFlex login
    "/api/horeca/bonnen", // only /api/horeca/bon itself is public, not a lookalike prefix
    "/api/agent", // only the horeca booking API is public, not every agent route
    "/api/agent/horecabeheer", // not a lookalike prefix
    "/api/werkgever/afspraken", // het afsprakenbeheer van een bedrijf: alleen met een sessie
    "/api/werkgever/afspraken/2026-11-12~abcdef12",
    "/api/werkgever/klanten", // de klanten van een bedrijf (persoonsgegevens van derden): alleen met een sessie
    "/api/boekenlijst", // alleen /api/boeken/<adres> is openbaar, geen lookalike
    // offertes en checklists zijn weg (22 nov 2026): hun oude links staan niet meer open
    "/api/offerte-link/aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ",
    "/api/checklist/abcdefghijklmnopqrstuvwxyz012345",
    // website-check, starters en het wensenformulier van /website-maken zijn weg (22 nov 2026)
    "/api/website-check",
    "/api/website-check/lead",
    "/api/starters",
    "/api/website-aanvraag",
    // de ontwerpvoorstellen (Schwarzwald, SmileyApp) en de websitevoorstellen van sales zijn weg (22 nov 2026, fase C)
    "/api/voorstel/smileyapp/chat",
    "/api/voorstel/schwarzwald/account",
    "/api/websitevoorstel/0123456789abcdef/bekeken",
    // rijschool, horeca, de boekpagina, Google-reviews en de certificaatvraag van Caddy zijn weg (22 nov 2026, fase C)
    "/api/sites/domein-check",
    "/api/rijschool/domein",
    "/api/rijschool/site/rijschool-test/account",
    "/api/horeca/site/de-zaak/reserveren",
    "/api/horeca/bon",
    "/api/agent/horeca",
    "/api/boeken/kapper-jan",
    "/api/review/abcdef",
    // de gratis scans met hun deal, advertenties en logo's op maat en het volgen van de monteur zijn weg (22 nov 2026, fase C)
    "/api/review-scan",
    "/api/review-scan/lead",
    "/api/deal/0123456789abcdef",
    "/api/advertentie",
    "/api/advertentie/0123456789abcdef0123456789abcdef/beeld",
    "/api/logo-maker",
    "/api/installatie/abc123def456.sleutel",
    // de community: schrijven alleen met een account (22 nov 2026)
    "/api/community/onderwerpen",
    "/api/community/onderwerpen/oabc123def4/reacties",
    "/api/community/onderwerpen/oabc123def4/handig",
    "/api/community/upload",
    "/api/community/fotos", // lijkt op /api/community/foto, maar is het niet
    "/api/communities", // de eigen groepen (lib/communities) blijven achter de login
    "/api/admin/community",
  ];
  it.each(cases)("%s is not public", (path) => {
    expect(isPublicApiRoute(path)).toBe(false);
  });
});
