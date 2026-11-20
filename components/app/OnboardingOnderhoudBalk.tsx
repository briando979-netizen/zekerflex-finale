import { featureEnabled } from "@/lib/flags";
import { getFreelancerDict } from "@/lib/i18n/server";

// Werkgevers zien Nederlands (hun omgeving is niet vijftalig).
const WERKGEVER = {
  titel: "We verbeteren de aanmelding",
  // kort gehouden (20 nov): de lange tekst ("wacht even met aanmelden") joeg een nieuw bedrijf weg; over de opbouwfase
  // gaat de blauwe balk in de layout al (OpbouwfaseBalk).
  tekst: "Loopt er iets vast of wordt iets niet goed gelezen? Ga gerust door of probeer het later nog eens. Via het vraagteken bovenaan helpen we je verder.",
};

/**
 * Melding boven de start van werkgevers zolang de onboarding wordt verbeterd (bij werkers weg sinds
 * 10 nov, eigenaar: de werker-app heeft het hulpcentrum achter het vraagteken). Geen
 * blokkade: wie wil, kan doorgaan. Uit te zetten zonder uitrol met de flag "onboarding-onderhoud"
 * (Admin → Systeem), zodra het weer soepel werkt.
 */
export async function OnboardingOnderhoudBalk({ soort }: { soort: "werker" | "werkgever" }) {
  if (!(await featureEnabled("onboarding-onderhoud"))) return null;
  const t = soort === "werker" ? (await getFreelancerDict()).onderhoud : WERKGEVER;
  return (
    <div role="status" className="mb-5 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm text-neutralx-700">
      <p className="font-semibold text-ink">{t.titel}</p>
      <p className="mt-1">{t.tekst}</p>
    </div>
  );
}
