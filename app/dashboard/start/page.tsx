import { redirect } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { StartSchermen } from "@/components/app/StartSchermen";
import { getBrancheKeuze } from "@/lib/worker/branche-store";
import { getZoeklocatie } from "@/lib/worker/zoeklocatie";
import { getFiscal } from "@/lib/fiscal/store";

export const dynamic = "force-dynamic";

/**
 * De start van een nieuwe werker als volschermstappen, zoals de app van YoungOnes (20 nov 2026, eigenaar):
 * "Waar wil je klussen doen?", "Heb je een KVK-nummer?" (22 nov) en "In welke branches ben je geïnteresseerd?". Ontdekken stuurt een nieuw account
 * hierheen (startSchermTonen); wie allebei al koos, gaat door naar Ontdekken, tenzij hij hier bewust terugkomt
 * (?opnieuw=1, bijvoorbeeld vanaf de branchekeuze in de stappen).
 */
export default async function StartPage({ searchParams }: { searchParams: Promise<{ opnieuw?: string | string[] }> }) {
  const principal = await requirePrincipal();
  const sp = await searchParams;
  const [brancheKeuze, zoeklocatie, fiscal] = await Promise.all([
    getBrancheKeuze(principal.userId).catch(() => null),
    getZoeklocatie(principal.userId).catch(() => null),
    getFiscal(principal.userId).catch(() => null),
  ]);
  if (brancheKeuze && zoeklocatie && sp.opnieuw !== "1") redirect("/dashboard/klussen");
  // de werkvorm ("Heb je een KVK-nummer?") staat sinds 22 nov 2026 ook in de start, tussen de plaats en de branches
  return <StartSchermen zoeklocatie={zoeklocatie} brancheKeuze={brancheKeuze} workerKind={fiscal?.workerKind ?? null} />;
}
