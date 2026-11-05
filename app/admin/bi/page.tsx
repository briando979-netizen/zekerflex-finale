import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { BiPanel } from "@/components/admin/BiPanel";

export const dynamic = "force-dynamic";

// Admin → Overzicht → Rapportages (BI): Metabase op de eigen server, door
// ZekerFlex zelf ingericht (lib/bi). Opdrachtgevers zien hun dashboard op
// /werkgever/rapportages; hier de stand, de inrichting en de link naar Metabase zelf.
export default async function BiPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Rapportages zijn alleen beschikbaar voor platformbeheerders." />;
  }
  return (
    <div className="space-y-5">
      <PageHead title="Rapportages (BI)" subtitle="Metabase draait op de eigen server, zonder licentie per gebruiker. ZekerFlex richt hem zelf in: een schema met alleen de cijfers die een bedrijf over zichzelf mag zien, en een dashboard per opdrachtgever." />
      <BiPanel />
    </div>
  );
}
