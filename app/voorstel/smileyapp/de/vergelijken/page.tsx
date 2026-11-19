import type { Metadata } from "next";
import { TEKSTEN } from "@/lib/voorstel/smileyapp-talen";
import { vergelijkRijen } from "@/lib/voorstel/smileyapp-vergelijken";
import { VergelijkenTaal } from "@/components/voorstel/smileyapp/taal/Hulp";
import { DEMO_KOP_KLASSE } from "@/components/voorstel/smileyapp/taal/Landing";
import { PaginaHero } from "@/components/voorstel/smileyapp/taal/Paginas";

// "Smileyapp of een papieren enquête?" in het Duits (/de/vergelijken), deel 6b. De
// standaardrijen zijn vertaald; een rij die het team zelf toevoegde blijft in de
// ingevoerde taal. Dynamisch: de rijen volgen het beheer.
export const dynamic = "force-dynamic";

const TAAL = "de";
const t = TEKSTEN[TAAL];

export const metadata: Metadata = {
  title: { absolute: t.meta.vergelijkenTitel },
  description: t.meta.vergelijkenOmschrijving,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default async function SmileyappVergelijkenGerman() {
  const rijen = await vergelijkRijen();
  return (
    <div lang="de">
      <PaginaHero boven={t.vergelijk.boven} sub={t.vergelijk.intro}>
        <h1 className={DEMO_KOP_KLASSE}>{t.vergelijk.kop}</h1>
      </PaginaHero>
      <VergelijkenTaal taal={TAAL} rijen={rijen} />
    </div>
  );
}
