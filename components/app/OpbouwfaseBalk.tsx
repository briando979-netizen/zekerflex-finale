import { featureEnabled } from "@/lib/flags";
import { getFreelancerDict } from "@/lib/i18n/server";
import { OpbouwfaseMelding } from "@/components/app/OpbouwfaseMelding";

// Werkgevers zien Nederlands (hun omgeving is niet vijftalig).
const WERKGEVER = {
  titel: "ZekerFlex is nog in de opbouwfase",
  tekst:
    "Bedankt dat je er al bij bent! Wat je ziet werkt echt, maar we zijn nog niet officieel gestart. Sommige klussen en kandidaten zijn testgegevens van ons zelf, om te zien of alles goed werkt. Je gegevens zijn veilig en je hoeft niets te verwijderen. Probeer gerust alles uit en vertel ons je ideeën.",
  meer: "Lees meer",
  sluit: "Melding sluiten",
};

/**
 * Balk bovenaan /dashboard en /werkgever zolang ZekerFlex nog niet officieel
 * live is: testklussen, gegevens veilig, ideeën welkom (/opbouwfase). Uit te
 * zetten zonder uitrol met de flag "opbouwfase-melding" (Admin → Systeem).
 */
export async function OpbouwfaseBalk({ soort }: { soort: "werker" | "werkgever" }) {
  if (!(await featureEnabled("opbouwfase-melding"))) return null;
  const t = soort === "werker" ? (await getFreelancerDict()).opbouw : WERKGEVER;
  return <OpbouwfaseMelding {...t} />;
}
