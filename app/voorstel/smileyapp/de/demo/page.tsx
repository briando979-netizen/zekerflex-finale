import type { Metadata } from "next";
import { beeld } from "@/lib/voorstel/smileyapp";
import { heeftTeam } from "@/lib/voorstel/smileyapp-accounts";
import { smileyappPakketten } from "@/lib/voorstel/smileyapp-pakketten";
import { TEKSTEN } from "@/lib/voorstel/smileyapp-talen";
import { DemoHero, DemoTaal, type DemoZoek } from "@/components/voorstel/smileyapp/taal/Demo";
import { DEMO_KOP_KLASSE } from "@/components/voorstel/smileyapp/taal/Landing";

// De demo-aanvraag van het SmileyApp-voorstel in het Duits (/de/demo): hetzelfde
// werkende formulier en dezelfde API als de Nederlandse pagina, met de taal van
// het formulier erbij ("de"), zodat het team ziet in welke taal iemand geholpen
// wil worden. De opbouw staat in components/voorstel/smileyapp/taal/Demo.tsx.
// ?pakket=<id> kiest een pakket alvast, ?bron=<woord> gaat mee met de aanvraag.
export const dynamic = "force-dynamic";

const TAAL = "de";
const t = TEKSTEN[TAAL];

export const metadata: Metadata = {
  title: { absolute: t.meta.demoTitel },
  description: t.meta.demoOmschrijving,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  openGraph: { title: t.meta.demoTitel, description: t.meta.demoOmschrijving, siteName: "Smileyapp", type: "website", locale: "de_DE", images: [{ url: beeld("logo.webp") }] },
  twitter: { card: "summary", title: t.meta.demoTitel, description: t.meta.demoOmschrijving },
};

export default async function SmileyappDemoDeutsch({ searchParams }: { searchParams: Promise<DemoZoek> }) {
  const [zoek, team, pakketten] = await Promise.all([searchParams, heeftTeam(), smileyappPakketten()]);
  return (
    <div lang="de">
      <DemoHero taal={TAAL}>
        <h1 className={DEMO_KOP_KLASSE}>{t.demo.kop}</h1>
      </DemoHero>
      <DemoTaal taal={TAAL} pakketten={pakketten} team={team} zoek={zoek} nu={new Date()} />
    </div>
  );
}
