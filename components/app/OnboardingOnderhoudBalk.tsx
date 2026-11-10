import { featureEnabled } from "@/lib/flags";
import { getFreelancerDict } from "@/lib/i18n/server";

// Werkgevers zien Nederlands (hun omgeving is niet vijftalig).
const WERKGEVER = {
  titel: "We verbeteren de aanmelding",
  tekst:
    "We zijn bezig met het verbeteren van de onboarding. Daardoor kan het tijdelijk haperen en kunnen dingen niet goed gelezen worden. Wil je soepel en snel je gegevens uploaden? Wacht dan even met de onboarding: je krijgt een bericht zodra we klaar zijn. ZekerFlex is nog volop in ontwikkeling en de klussen die je ziet zijn testklussen. Begin volgend jaar gaan we online; je kunt alvast proeven hoe het er straks uitziet. Bedankt voor je begrip!",
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
