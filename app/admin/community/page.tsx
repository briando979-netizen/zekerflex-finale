import { getPrincipal, hasRole } from "@/lib/auth";
import { KpiStrip, PageHead } from "@/components/admin/kit";
import { CommunityBeheer } from "@/components/admin/CommunityBeheer";
import { beheerOverzicht } from "@/lib/community/beheer";

export const dynamic = "force-dynamic";

// Beheer → Communicatie → Community (22 nov 2026): de openbare community op /community. Gemelde berichten eerst (na drie
// meldingen van verschillende mensen al verborgen), dan het nieuwste. Tonen, verbergen, verwijderen, vastpinnen, iemand
// uitsluiten, of nieuwe berichten tijdelijk dichtzetten.
export default async function CommunityBeheerPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De community beheren kan alleen een platformbeheerder." />;
  }
  const overzicht = await beheerOverzicht();
  const { cijfers } = overzicht;
  return (
    <>
      <PageHead
        title="Community"
        subtitle="Het openbare forum op zekerflex.com/community. Iedereen kan lezen en melden; meedoen kan met een gratis account."
        actions={
          <a href="/community" className="a-btn a-btn-ghost" target="_blank" rel="noopener noreferrer">
            Bekijk de community
          </a>
        }
      />
      <KpiStrip
        items={[
          { label: "Onderwerpen", value: cijfers.onderwerpen },
          { label: "Reacties", value: cijfers.reacties },
          { label: "Gemeld, wacht op jou", value: cijfers.gemeld, tone: cijfers.gemeld > 0 ? "warn" : "ok" },
          { label: "Uitgesloten", value: cijfers.uitgesloten },
        ]}
      />
      <div className="mt-6">
        <CommunityBeheer begin={overzicht} />
      </div>
    </>
  );
}
