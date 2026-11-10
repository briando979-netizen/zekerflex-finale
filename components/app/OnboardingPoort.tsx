"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { toegestaanTijdensOnboarding } from "@/lib/onboarding/werker-poort";

/**
 * De poort van de werker-app (lib/onboarding/werker-poort.ts): zolang de onboarding niet is
 * ingevuld, toont elke pagina de start, behalve de schermen waar je de stappen invult
 * (Verificatie, Fiscaal) en je account. Alleen weergave: de echte controles vóór werk staan
 * op de server (lib/fiscal/eligibility.ts, lib/werkrecht).
 */
export function OnboardingPoort({ klaar, start, children }: { klaar: boolean; start: ReactNode; children: ReactNode }) {
  const pad = usePathname();
  if (klaar || !start || toegestaanTijdensOnboarding(pad)) return <>{children}</>;
  return <>{start}</>;
}
