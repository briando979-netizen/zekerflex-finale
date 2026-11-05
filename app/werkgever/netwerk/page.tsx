import { getPrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { featureEnabled } from "@/lib/flags";
import { env } from "@/lib/env";
import { isCompTenant } from "@/lib/billing/comp";
import { RADIUS_POORT } from "@/lib/netwerk/modules";
import { moduleLeverbaar } from "@/lib/netwerk/abonnement";
import { netwerkStand, vestigingenVan, vpnLog, weergave, wifiInstellingen, wifiWachtwoord } from "@/lib/netwerk/store";
import { vpnAdres, vpnApparaten, vpnGekoppeld } from "@/lib/netwerk/headscale";
import { Verbinding, type VerbindingData } from "@/components/app/netwerk/Verbinding";

export const dynamic = "force-dynamic";

// Werkgever → Wifi en VPN: de netwerkpakketten van ZekerFlex (lib/netwerk).
// Toegang tot /werkgever is al afgedwongen in app/werkgever/layout.tsx.
export default async function NetwerkPage() {
  const principal = await getPrincipal();
  if (!principal) return null;
  if (!(await featureEnabled("netwerk-pakketten", { userId: principal.userId }))) {
    return (
      <div className="surface p-6 text-sm text-neutralx-600" role="status">
        Dit onderdeel staat op dit moment uit.
      </div>
    );
  }
  const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
  if (!tenantId) {
    return (
      <div className="surface p-6 text-sm text-neutralx-600" role="status">
        Maak eerst je bedrijfsprofiel af; daarna kun je hier wifi en VPN regelen.
      </div>
    );
  }
  const magBeheren = hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
  const [stand, vestigingen, wifi, apparaten, log, free, mijnWachtwoord] = await Promise.all([
    netwerkStand(tenantId),
    vestigingenVan(tenantId),
    wifiInstellingen(tenantId),
    vpnApparaten(tenantId),
    vpnLog(tenantId),
    isCompTenant(tenantId),
    wifiWachtwoord(principal.userId),
  ]);
  const data: VerbindingData = {
    stand,
    vestigingen: vestigingen.map((v) => {
      const w = wifi.vestigingen[v.id];
      return { ...v, wifi: w ? weergave(v.id, w) : null };
    }),
    wifiServer: { host: env.NETWERK_RADIUS_HOST, poort: RADIUS_POORT, klaar: moduleLeverbaar("wifi") },
    vpn: { gekoppeld: vpnGekoppeld(), adres: vpnAdres(), apparaten, log },
    mijnWifi: { gebruiker: principal.email, wachtwoord: mijnWachtwoord },
    free,
    magBeheren,
  };
  return <Verbinding data={data} />;
}
