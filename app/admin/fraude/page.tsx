import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { CollusionBoard } from "@/components/admin/CollusionBoard";
import { ClawbacksPanel } from "@/components/admin/ClawbacksPanel";
import { FraudShieldPanel } from "@/components/admin/FraudShieldPanel";
import { fraudeOverzicht } from "@/lib/fraud/account";

export const dynamic = "force-dynamic";

export default async function FraudePage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Fraudesignalen zijn alleen voor platformbeheerders." />;
  }
  // één bron die stuk is, mag de pagina niet omgooien
  const overzicht = await fraudeOverzicht().catch(() => null);
  return (
    <div className="space-y-4">
      <PageHead
        title="Fraude & signalen"
        subtitle="FraudShield geeft elk account met een signaal één risicoscore. Daaronder de collusie- en witwasdetectie op paren van opdrachtgever en werknemer, en de terugboekingen. Signalen bij uren ziet de opdrachtgever per urenbriefje bij Uren."
      />
      {overzicht && <FraudShieldPanel overzicht={overzicht} />}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <CollusionBoard />
        <ClawbacksPanel />
      </div>
    </div>
  );
}
