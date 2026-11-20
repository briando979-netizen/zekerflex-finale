import { redirect } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { StartSchermen } from "@/components/app/StartSchermen";
import { getBrancheKeuze } from "@/lib/worker/branche-store";
import { getZoeklocatie } from "@/lib/worker/zoeklocatie";

export const dynamic = "force-dynamic";

/**
 * De start van een nieuwe werker als twee volschermstappen, zoals de app van YoungOnes (20 nov 2026, eigenaar):
 * "Waar wil je klussen doen?" en "In welke branches ben je geïnteresseerd?". Ontdekken stuurt een nieuw account
 * hierheen (startSchermTonen); wie allebei al koos, gaat door naar Ontdekken, tenzij hij hier bewust terugkomt
 * (?opnieuw=1, bijvoorbeeld vanaf de branchekeuze in de stappen).
 */
export default async function StartPage({ searchParams }: { searchParams: Promise<{ opnieuw?: string | string[] }> }) {
  const principal = await requirePrincipal();
  const sp = await searchParams;
  const [brancheKeuze, zoeklocatie] = await Promise.all([
    getBrancheKeuze(principal.userId).catch(() => null),
    getZoeklocatie(principal.userId).catch(() => null),
  ]);
  if (brancheKeuze && zoeklocatie && sp.opnieuw !== "1") redirect("/dashboard/klussen");
  return <StartSchermen zoeklocatie={zoeklocatie} brancheKeuze={brancheKeuze} />;
}
