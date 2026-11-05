import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { BronnenPanel } from "@/components/admin/BronnenPanel";

export const dynamic = "force-dynamic";

// Admin → AI & automatisering → Bronnen: gegevens die de server zelf van buiten
// haalt (pompprijzen, minimumloon, cao-bekendmakingen, KVK-controle) en de
// schermcontrole van de eigen site met een echte browser (lib/bronnen).
export default async function BronnenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Bronnen zijn alleen beschikbaar voor platformbeheerders." />;
  }
  return (
    <div className="space-y-5">
      <PageHead title="Bronnen" subtitle="Wat de server zelf van buiten ophaalt, op schema en zonder abonnement: open data, officiële bekendmakingen, het Handelsregister en een echte browser die de eigen site bekijkt." />
      <BronnenPanel />
    </div>
  );
}
