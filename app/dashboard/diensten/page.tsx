import { requirePrincipal } from "@/lib/auth";
import { getMyWork } from "@/lib/dashboard/my-work";
import { MyKlussenView } from "@/components/app/MyKlussenView";

export const dynamic = "force-dynamic";

// Mijn klussen (21 nov 2026, de opzet van YoungOnes): de kop "Mijn klussen" staat al in de balk bovenaan
// (FreelancerShell), dus hier meteen de tabs. Het weekoverzicht is weg: die app heeft het niet, en de uren per week
// staan bij Uren invullen en op de kluspagina.
export default async function MijnKlussenPage() {
  const principal = await requirePrincipal();
  const work = await getMyWork(principal.userId);
  return <MyKlussenView work={work} />;
}
