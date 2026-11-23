import { hasRole, requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getDict } from "@/lib/i18n/server";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { incheckenVereist } from "@/lib/checkin/vereist";
import { automatischHeropenen } from "@/lib/werkgever/heropenen";
import { EmptyState } from "@/components/app/ui";
import { Kaart } from "@/components/werkgever/Kaart";
import { InstellingenKop } from "@/components/werkgever/InstellingenKop";
import { HeropenenInstelling } from "@/components/werkgever/HeropenenInstelling";
import { MaxUrenInstelling } from "@/components/werkgever/MaxUrenInstelling";
import { IncheckenInstelling } from "@/components/werkgever/IncheckenInstelling";

export const dynamic = "force-dynamic";

// Instellingen → Klus-instellingen (23 nov 2026, naar YoungOnes "Klus instellingen"): wat voor al je klussen geldt. Automatisch heropenen
// (nieuw; standaard aan, zoals het altijd werkte), het maximum aantal uren per werker en inchecken. Maximum uren en inchecken stonden
// onderaan het Bedrijfsprofiel; zij werken hier met dezelfde opslag en dezelfde routes als eerst.
export default async function KlusInstellingenPage() {
  const principal = await requirePrincipal();
  const d = await getDict();
  const k = d.klusInstellingen;
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];

  if (!tenantId) {
    return (
      <>
        <InstellingenKop title={k.titel} />
        <EmptyState title={d.company.noOrgTitle} body={d.company.noOrgBody} />
      </>
    );
  }

  const [extra, heropenen, incheckVereist] = await Promise.all([
    getOrgProfileExtra(tenantId),
    automatischHeropenen(tenantId),
    // moeten je werkers inchecken? (lib/checkin/vereist.ts; standaard ja)
    incheckenVereist(tenantId),
  ]);

  return (
    <>
      <InstellingenKop title={k.titel} />
      {/* één kolom, zoals bij YoungOnes: elke instelling in een eigen kaart met uitleg */}
      <div className="max-w-2xl space-y-6">
        {/* de gedeelde kaart van de werkgeversapp (components/werkgever/Kaart.tsx); de instelling zelf heeft haar eigen ruimte */}
        <Kaart titel={k.heropenenTitel} vulling={false}>
          <HeropenenInstelling initial={heropenen} kanBeheren={hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")} />
        </Kaart>
        {/* maximum uren per werker per 12 maanden (lib/werkgever/max-uren.ts) */}
        <Kaart titel={d.company.maxUrenTitel} vulling={false}>
          <MaxUrenInstelling initial={extra.maxUrenPerWerker ?? 0} />
        </Kaart>
        {/* inchecken door je werkers: ja (standaard) of nee, dan is jouw goedkeuring van de uren het bewijs */}
        <Kaart titel={d.company.incheckTitel} vulling={false}>
          <IncheckenInstelling initial={incheckVereist} />
        </Kaart>
      </div>
    </>
  );
}
