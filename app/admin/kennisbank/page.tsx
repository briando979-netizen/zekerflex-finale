import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { KennisbankPanel } from "@/components/admin/KennisbankPanel";

export const dynamic = "force-dynamic";

// Admin → AI & automatisering → Kennisbank: Outline op de eigen server, met
// "Inloggen met ZekerFlex" en de handleidingen uit docs/kennisbank (lib/kennisbank).
export default async function KennisbankPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De kennisbank is alleen voor platformbeheerders in te richten." />;
  }
  return (
    <div className="space-y-5">
      <PageHead title="Kennisbank" subtitle="Handleidingen voor flexwerkers, opdrachtgevers en het eigen team: Outline op de eigen server, zonder abonnement. Iedereen logt in met zijn ZekerFlex-account." />
      <KennisbankPanel />
    </div>
  );
}
