"use client";

import { Rondleiding } from "@/components/app/Rondleiding";
import { RONDLEIDING_BEDRIJF_KEY, RONDLEIDING_BEDRIJF_STAPPEN, type RondleidingBedrijfTeksten } from "@/lib/onboarding/rondleiding-bedrijf";

/**
 * De rondleiding door de werkgeversapp (lib/onboarding/rondleiding-bedrijf.ts): na de eerste sessie één keer vanzelf, daarna via het
 * vraagteken (Hulp). De teksten komen van de server in de taal van de app; de uitvoering is die van de werker (components/app/Rondleiding.tsx).
 */
export function BedrijfRondleiding({ t }: { t: RondleidingBedrijfTeksten }) {
  return <Rondleiding t={t} stappen={RONDLEIDING_BEDRIJF_STAPPEN} sleutel={RONDLEIDING_BEDRIJF_KEY} />;
}
