import type { Metadata } from "next";
import { heeftTeam } from "@/lib/voorstel/smileyapp-accounts";
import { TEKSTEN } from "@/lib/voorstel/smileyapp-talen";
import { PartnerHero, PartnerTaal } from "@/components/voorstel/smileyapp/taal/Contact";
import { DEMO_KOP_KLASSE } from "@/components/voorstel/smileyapp/taal/Landing";

// "Partner worden" in het Engels (/en/partner-worden), deel 6b: hetzelfde werkende
// formulier en dezelfde API als de Nederlandse pagina, met de taal van het formulier
// erbij, zodat het team ziet in welke taal iemand geholpen wil worden.
export const dynamic = "force-dynamic";

const TAAL = "en";
const t = TEKSTEN[TAAL];

export const metadata: Metadata = {
  title: { absolute: t.meta.partnerTitel },
  description: t.meta.partnerOmschrijving,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default async function SmileyappPartnerEnglish() {
  const team = await heeftTeam();
  return (
    <div lang="en">
      <PartnerHero taal={TAAL}>
        <h1 className={DEMO_KOP_KLASSE}>{t.partner.kop}</h1>
      </PartnerHero>
      <PartnerTaal taal={TAAL} team={team} />
    </div>
  );
}
