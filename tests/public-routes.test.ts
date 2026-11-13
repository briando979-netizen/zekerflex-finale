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
    "/api/netwerk/radius/authorize",
    "/api/netwerk/radius/client",
    "/api/kennis/whitepaper/omzetbelasting",
    "/api/mail/afmelden",
    "/api/mail/voorkeuren",
    "/api/nieuwsbrief",
    "/api/nieuwsbrief/afmelden",
    "/api/analytics/track",
    "/api/analytics/taal-vraag",
    "/api/shop/products",
    "/api/shop/media/abc123",
    "/api/company/search",
    "/api/terminal/abc123-sleutel",
    "/api/installatie/abc123def456.sleutel", // klant en monteur volgen een installatie met de code in het adres
    "/api/installatie/abc123def456.sleutel/positie",
    "/api/boeken/kapper-jan", // boekpagina van een bedrijf: vrije tijden en boeken, IP-begrensd
    "/api/offerte-link/aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ", // een klant bekijkt/beantwoordt een offerte met de geheime link
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
    "/api/sites/domein-check", // Caddy's on-demand TLS ask
    "/api/media/youtube/dQw4w9WgXcQ", // our copy of a YouTube thumbnail
    "/api/indexnow-key", // IndexNow verifies site ownership without a session
    "/api/rekentools/uitkomst", // "stuur mij de uitkomst" on the public rekentools
    "/api/auth/werkgever", // /klus-plaatsen: is the caller's own session a werkgever? (yes/no only)
    "/api/auth/passkey", // begin van inloggen met passkey: eenmalige challenge, IP-begrensd (zonder sessie, je logt juist in)
    "/api/auth/callback/passkey", // NextAuth: de passkey-provider zelf (controleert challenge, handtekening en account)
    "/api/review-scan", // free public review-scan
    "/api/review-scan/lead", // its contact form
    "/api/klus-plaatsen/website", // /klus-plaatsen reads a company's public front page
    "/api/deal/0123456789abcdef", // tailored offer after a free scan (unguessable id)
    "/api/domeinen/zoek", // is a domain name still free (public RDAP)
    "/api/domeinen/aanvraag", // request a domain / transfer
    "/api/rijschool/domein", // middleware lookup: which driving school owns this own domain
    "/api/rijschool/domein/bewijs", // https proof on the own domain of a driving school
    "/api/oidc/authorize", // "Inloggen met ZekerFlex": the route itself sends a guest to /login
    "/api/oidc/token", // the service exchanges the code with its client secret
    "/api/oidc/jwks", // public signing key
    "/api/toegang/kenteken", // the barrier box asks whether a plate may enter (own token per branch)
    "/api/toegang/opdrachten", // the barrier box polls for manual open commands
    "/api/printen/agent", // the print agent fetches the label queue (own token per company)
    "/api/horeca/scherm", // horeca screens: a paired device (own signed cookie) or the owner
    "/api/horeca/scherm/koppel", // pair a device with a 15-minute code (IP-limited)
    "/api/horeca/bon", // a guest's receipt as pdf or mail, only with a signed link to one paid receipt
    "/api/agent/horeca", // AI assistants list restaurants with online booking
    "/api/agent/horeca/de-zaak/beschikbaarheid", // free times for a day
    "/api/agent/horeca/de-zaak/reserveringen", // book a table (rate-limited, same capacity check as the own site)
    "/api/agent/horeca/reserveringen/token", // view or cancel with the signed cancel link
    "/api/checklist/abcdefghijklmnopqrstuvwxyz012345", // personeel zonder account vult een checklist in; de sleutel in het adres is het bewijs
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
    "/api/admin/boekhouding/bonnen", // de bonnen van de boekhouding: alleen platformbeheerders
    "/api/admin/boekhouding/bonnen/abc123def456/bestand",
    "/api/werkgever/claims/claim_1",
    "/api/timesheets/ts_1/submit",
    "/api/people/search",
    "/api/geo/reverse", // het dichtstbijzijnde adres bij een punt: alleen met een sessie
    "/api/geo/search", // alleen met een sessie; /api/geo is niet als geheel openbaar aangemerkt
    "/api/calls/incoming",
    "/api/sites/domein-check/extra", // exact match only
    "/api/werkgever/sites/domain",
    "/api/werkgever/netwerk",
    "/api/netwerk",
    "/api/netwerk/iets-anders",
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
    "/api/werkgever/offertes", // het offertebeheer van een bedrijf (klantgegevens): alleen met een sessie
    "/api/werkgever/offertes/o0123456789ab",
    "/api/offertes", // alleen /api/offerte-link/<token> is openbaar
    "/api/offerte-linkje", // geen lookalike
    "/api/werkgever/checklists", // het checklistbeheer van een bedrijf: alleen met een sessie
    "/api/werkgever/checklists/uitvoeringen", // wie wat deed (namen van personeel): alleen met een sessie
    "/api/werkgever/checklists/uitvoerders",
    "/api/checklists", // alleen /api/checklist/<sleutel> is openbaar, geen lookalike
  ];
  it.each(cases)("%s is not public", (path) => {
    expect(isPublicApiRoute(path)).toBe(false);
  });
});
