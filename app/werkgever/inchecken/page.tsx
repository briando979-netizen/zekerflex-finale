import { requirePrincipal } from "@/lib/auth";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/app/ui";
import { TerminalsBeheer } from "@/components/app/TerminalsBeheer";
import { SamenTabs } from "@/components/werkgever/SamenTabs";
import Link from "next/link";
import { getDict } from "@/lib/i18n/server";
import { INCHECK_KASTJES_AAN } from "@/lib/incheck/aan";

export const dynamic = "force-dynamic";

// Inchecken op locatie: terminals (tablet aan de muur), NFC-stickers en
// sleutelhangers per vestiging (lib/incheck). Uren komen zo zonder handwerk
// in het urenbriefje, op de plek van de vestiging zelf.
export default async function IncheckenPage() {
  await requirePrincipal();
  // 21 nov 2026: geen kastjes, NFC of sleutelhangers meer (lib/incheck/aan.ts); inchecken gaat met de QR-poster per vestiging
  if (!INCHECK_KASTJES_AAN) {
    const t = (await getDict()).incheckQr;
    return (
      <>
        <SamenTabs groep="uren" actief="inchecken" />
        <PageHeader eyebrow={t.eyebrow} title={t.titel} subtitle={t.uitleg} />
        <Link href="/werkgever/locaties" className="btn-primary">
          {t.knop}
        </Link>
      </>
    );
  }
  const origin = new URL(env.APP_BASE_URL).origin;
  return (
    <>
      <SamenTabs groep="uren" actief="inchecken" />
      <PageHeader
        eyebrow="Personeel"
        title="Inchecken op locatie"
        subtitle="Een tablet bij de ingang, een NFC-sticker of een sleutelhanger: je krachten checken in zonder dat jij uren hoeft over te typen. Elke check-in staat meteen in het urenbriefje."
      />
      <TerminalsBeheer origin={origin} />
    </>
  );
}
