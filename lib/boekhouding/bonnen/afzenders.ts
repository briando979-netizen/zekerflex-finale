// ---------------------------------------------------------------------------
// Bonnen per mail: de lijst eigen afzenders (KV `boekhouding:eigen-afzenders`, standaard leeg). Alleen mail van een
// afzender op deze lijst kan vanzelf worden geboekt (en dan nog alleen met geslaagde SPF en DKIM). Het scherm om de
// lijst te beheren komt later; tot dan staat de lijst leeg en gaat elke bon naar "even kijken".
// De lijst is van het platform zelf (de eigen administratie), niet van een organisatie of een gebruiker: daarom geen
// regel in lib/privacy/org-kv.ts of user-kv.ts.
// ---------------------------------------------------------------------------

import { kvGet, kvSet } from "@/lib/storage/kv";
import { valideerEigenAfzenders } from "./mail-kern";

export const EIGEN_AFZENDERS_SLEUTEL = "boekhouding:eigen-afzenders";

/** De lijst; een kapotte of ontbrekende waarde of een onbereikbare opslag geeft een lege lijst (dan wordt niets vanzelf geboekt). */
export async function leesEigenAfzenders(): Promise<string[]> {
  try {
    const ruw = await kvGet<unknown>(EIGEN_AFZENDERS_SLEUTEL);
    return ruw === null ? [] : valideerEigenAfzenders(ruw);
  } catch {
    return [];
  }
}

/** Vervangt de lijst. Gooit AppError.validation bij een ongeldige lijst; de oude lijst blijft dan staan. */
export async function schrijfEigenAfzenders(lijst: unknown): Promise<string[]> {
  const schoon = valideerEigenAfzenders(lijst);
  await kvSet(EIGEN_AFZENDERS_SLEUTEL, schoon);
  return schoon;
}
