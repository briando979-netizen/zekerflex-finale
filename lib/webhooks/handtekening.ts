// Antwoord op een webhook met een ongeldige handtekening: 423 met een eigen code, nooit 400/401/403.
// CrowdSec telt in het Caddy-log elke 400/403 (http-probing) en elke POST-401/403 (http-generic-bf) als
// inbraakpoging: een verkeerd token bij Twilio of Stripe zou het adres van die dienst dus blokkeren en
// alle telefoontjes of betalingen stilleggen. 423 telt in geen enkel scenario. Het verzoek wordt
// gewoon niet uitgevoerd; een geldige handtekening gaat ongewijzigd door.

import { NextResponse } from "next/server";

export const HANDTEKENING_ONGELDIG = "handtekening_ongeldig";
export const HANDTEKENING_ONGELDIG_STATUS = 423;

/** Voor Twilio-routes (TwiML/tekst). */
export function handtekeningOngeldigTekst(): Response {
  return new Response("Handtekening ongeldig", {
    status: HANDTEKENING_ONGELDIG_STATUS,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "x-zf-code": HANDTEKENING_ONGELDIG },
  });
}

/** Voor JSON-webhooks (Stripe, Didit). */
export function handtekeningOngeldigJson(): NextResponse {
  return NextResponse.json(
    { error: { code: HANDTEKENING_ONGELDIG, message: "Ongeldige handtekening" } },
    { status: HANDTEKENING_ONGELDIG_STATUS, headers: { "Cache-Control": "no-store" } },
  );
}