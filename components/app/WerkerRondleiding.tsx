"use client";

import { useFT } from "@/components/i18n/useFT";
import { Rondleiding } from "@/components/app/Rondleiding";
import { RONDLEIDING_KEY, RONDLEIDING_STAPPEN } from "@/lib/onboarding/rondleiding";

/**
 * De rondleiding door de werker-app (lib/onboarding/rondleiding.ts): na de eerste sessie één keer vanzelf, daarna via Hulp.
 * De uitvoering staat in components/app/Rondleiding.tsx; de teksten in de woordenlijst van de werker (lib/i18n/freelancer.ts, vijf talen).
 */
export function WerkerRondleiding() {
  const t = useFT().rondleiding;
  return <Rondleiding t={t} stappen={RONDLEIDING_STAPPEN} sleutel={RONDLEIDING_KEY} />;
}
