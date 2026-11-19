import type { Metadata } from "next";
import { beeld } from "@/lib/voorstel/smileyapp";
import { heeftTeam } from "@/lib/voorstel/smileyapp-accounts";
import { afsprakenVoorSite } from "@/lib/voorstel/smileyapp-agenda";
import { smileyappPakketten } from "@/lib/voorstel/smileyapp-pakketten";
import { TEKSTEN } from "@/lib/voorstel/smileyapp-talen";
import { DemoHero, DemoTaal, type DemoZoek } from "@/components/voorstel/smileyapp/taal/Demo";
import { DEMO_KOP_KLASSE } from "@/components/voorstel/smileyapp/taal/Landing";

// De demo-aanvraag van het SmileyApp-voorstel in het Engels (/en/demo): hetzelfde
// werkende formulier en dezelfde API als de Nederlandse pagina, met de taal van
// het formulier erbij ("en"), zodat het team ziet in welke taal iemand geholpen
// wil worden. De opbouw staat in components/voorstel/smileyapp/taal/Demo.tsx.
// ?pakket=<id> kiest een pakket alvast, ?bron=<woord> gaat mee met de aanvraag.
export const dynamic = "force-dynamic";

const TAAL = "en";
const t = TEKSTEN[TAAL];

export const metadata: Metadata = {
  title: { absolute: t.meta.demoTitel },
  description: t.meta.demoOmschrijving,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  openGraph: { title: t.meta.demoTitel, description: t.meta.demoOmschrijving, siteName: "Smileyapp", type: "website", locale: "en_GB", images: [{ url: beeld("logo.webp") }] },
  twitter: { card: "summary", title: t.meta.demoTitel, description: t.meta.demoOmschrijving },
};

export default async function SmileyappDemoEnglish({ searchParams }: { searchParams: Promise<DemoZoek> }) {
  // de open tijden uit de agenda van het team, in deze taal en in Nederlandse tijd; leeg: alleen het voorkeursmoment
  const [zoek, team, pakketten, afspraken] = await Promise.all([searchParams, heeftTeam(), smileyappPakketten(), afsprakenVoorSite(TAAL)]);
  return (
    <div lang="en">
      <DemoHero taal={TAAL}>
        <h1 className={DEMO_KOP_KLASSE}>{t.demo.kop}</h1>
      </DemoHero>
      <DemoTaal taal={TAAL} pakketten={pakketten} team={team} zoek={zoek} nu={new Date()} afspraken={afspraken} />
    </div>
  );
}
