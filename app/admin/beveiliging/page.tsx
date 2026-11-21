import { hasRole, requirePrincipal } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { AanvalsbeschermingPanel } from "@/components/admin/AanvalsbeschermingPanel";
import { SecurityIntelligencePanel } from "@/components/admin/SecurityIntelligencePanel";
import { beveiligingsBeeld } from "@/lib/security/intelligence";
import { RecoveryShieldPanel } from "@/components/admin/RecoveryShieldPanel";
import { readBackupReport } from "@/lib/ops/backup";
import { herstelStand } from "@/lib/ops/herstel-regels";

export const dynamic = "force-dynamic";

/**
 * /admin/beveiliging — het dreigingsbeeld, de herstelstand van de back-ups en wat de aanvalsbescherming (CrowdSec) tegenhoudt.
 * Tweestapsverificatie is weg (21 nov 2026, eigenaar; lib/auth/tweestap-aan.ts): inloggen gaat met wachtwoord of passkey.
 */
export default async function BeveiligingPage() {
  const principal = await requirePrincipal();
  if (!hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="space-y-4">
        <PageHead title="Beveiliging" subtitle="Alleen de platformbeheerder ziet het dreigingsbeeld en de aanvalsbescherming." />
      </div>
    );
  }

  const now = new Date();
  // één bron die stuk is, mag de pagina niet omgooien
  const beeld = await beveiligingsBeeld(now).catch(() => null);
  const herstel = await readBackupReport()
    .then(herstelStand)
    .catch(() => null);

  return (
    <div className="space-y-4">
      <PageHead title="Beveiliging" subtitle="Het dreigingsbeeld, de herstelstand van de back-ups en wat de aanvalsbescherming op de server tegenhoudt." />
      {beeld && <SecurityIntelligencePanel beeld={beeld} now={now} />}
      {herstel && <RecoveryShieldPanel stand={herstel} />}
      <AanvalsbeschermingPanel />
    </div>
  );
}
