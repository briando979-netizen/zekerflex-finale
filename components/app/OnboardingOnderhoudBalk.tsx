import { featureEnabled } from "@/lib/flags";

// Werkgevers zien Nederlands (hun omgeving is niet vijftalig).
const WERKGEVER = {
  titel: "We verbeteren de aanmelding",
  // kort gehouden (20 nov): de lange tekst ("wacht even met aanmelden") joeg een nieuw bedrijf weg; over de opbouwfase
  // gaat de blauwe balk op het startscherm al (OpbouwfaseBalk, sinds 22 nov 2026 niet meer op elke pagina).
  tekst: "Loopt er iets vast of wordt iets niet goed gelezen? Ga gerust door of probeer het later nog eens. Via het vraagteken bovenaan helpen we je verder.",
};

/**
 * Melding boven de start van werkgevers zolang de onboarding wordt verbeterd (bij werkers weg sinds
 * 10 nov, eigenaar: de werker-app heeft het hulpcentrum achter het vraagteken; hun teksten in lib/i18n/freelancer.ts zijn op
 * 22 nov 2026 weggehaald). Geen blokkade: wie wil, kan doorgaan. Uit te zetten zonder uitrol met de flag
 * "onboarding-onderhoud" (Admin → Systeem), zodra het weer soepel werkt.
 */
export async function OnboardingOnderhoudBalk() {
  if (!(await featureEnabled("onboarding-onderhoud"))) return null;
  return (
    <div role="status" className="mb-5 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm text-neutralx-700">
      <p className="font-semibold text-ink">{WERKGEVER.titel}</p>
      <p className="mt-1">{WERKGEVER.tekst}</p>
    </div>
  );
}
