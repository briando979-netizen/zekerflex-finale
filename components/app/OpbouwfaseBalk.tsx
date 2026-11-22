import { featureEnabled } from "@/lib/flags";
import { OpbouwfaseMelding } from "@/components/app/OpbouwfaseMelding";

// Werkgevers zien Nederlands (hun omgeving is niet vijftalig). Bij werkers bestaat de balk niet meer (10 nov, eigenaar); hun
// teksten in lib/i18n/freelancer.ts zijn op 22 nov 2026 weggehaald.
const WERKGEVER = {
  titel: "ZekerFlex is nog in de opbouwfase",
  tekst:
    "Bedankt dat je er al bij bent! Wat je ziet werkt echt, maar we zijn nog niet officieel gestart. Sommige klussen en kandidaten zijn testgegevens van ons zelf, om te zien of alles goed werkt. Je gegevens zijn veilig en je hoeft niets te verwijderen. Probeer gerust alles uit en vertel ons je ideeën.",
  meer: "Lees meer",
  sluit: "Melding sluiten",
};

/**
 * Balk bovenaan het startscherm van /werkgever (sinds 22 nov 2026 niet meer op elke
 * werkgeverspagina; bij werkers staat hij sinds 10 nov niet) zolang ZekerFlex nog niet officieel
 * live is: testklussen, gegevens veilig, ideeën welkom (/opbouwfase, sinds 22 nov 2026 een omleiding naar de voorpagina). Uit te
 * zetten zonder uitrol met de flag "opbouwfase-melding" (Admin → Systeem).
 */
export async function OpbouwfaseBalk() {
  if (!(await featureEnabled("opbouwfase-melding"))) return null;
  return <OpbouwfaseMelding {...WERKGEVER} />;
}
