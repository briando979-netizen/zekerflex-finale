import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { BoekhoudingScherm } from "@/components/admin/boekhouding/BoekhoudingScherm";

export const dynamic = "force-dynamic";

// Beheer → Financiën → Boekhouding: de administraties, de bonnen die nagekeken moeten worden en de eigen afzenders.
export default async function BoekhoudingPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De boekhouding is alleen beschikbaar voor platformbeheerders." />;
  }
  return <BoekhoudingScherm />;
}
