import { createHash, createHmac } from "node:crypto";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// De hash van een documentnummer, om hetzelfde document bij een ander account
// te zien (review 06, N3). Een HMAC met een sleutel uit AUTH_SECRET: een
// ongezouten SHA-256 van een documentnummer is offline terug te rekenen (de
// nummers zijn kort en voorspelbaar). Over het genormaliseerde nummer, zonder
// de documentsoort: wie bij hetzelfde nummer "paspoort" kiest in plaats van
// "ID-kaart", krijgt dezelfde hash. Het uitgevende land zit er bewust niet in:
// dat is niet altijd bekend (geen leesbare MRZ, rijbewijs), en een treffer
// leidt alleen tot een menselijke controle.
// ---------------------------------------------------------------------------

/** Zoals zelfdeNummer (lib/kyc/mrz.ts): hoofdletters, alleen A–Z en 0–9, O = 0. */
export function normaalNummer(nummer: string): string {
  return nummer.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0");
}

export function documentHash(nummer: string): string {
  const sleutel = createHash("sha256").update(`zf-documenthash:${env.AUTH_SECRET}`).digest();
  return createHmac("sha256", sleutel).update(normaalNummer(nummer)).digest("hex").slice(0, 48);
}
