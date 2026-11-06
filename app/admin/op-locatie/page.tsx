import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { OpLocatieAdmin } from "@/components/admin/OpLocatieAdmin";

export const dynamic = "force-dynamic";

// Admin → Sales & groei → Op locatie: de vier werkvloermodules (lib/locatie)
// over alle bedrijven: wie wat aan heeft, gebruik en apparaten op locatie.
export default async function OpLocatieAdminPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De Op locatie-modules zijn alleen beschikbaar voor platformbeheerders." />;
  }
  return <OpLocatieAdmin />;
}
