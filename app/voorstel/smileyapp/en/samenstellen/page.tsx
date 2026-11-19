import type { Metadata } from "next";
import { KEUZE_MAX, keuzeUitZoek } from "@/lib/voorstel/smileyapp-samensteller";
import { TEKSTEN } from "@/lib/voorstel/smileyapp-talen";
import { vul } from "@/lib/voorstel/smileyapp-teksten";
import { SamenstellenTaal } from "@/components/voorstel/smileyapp/taal/Hulp";
import { DEMO_KOP_KLASSE } from "@/components/voorstel/smileyapp/taal/Landing";
import { PaginaHero } from "@/components/voorstel/smileyapp/taal/Paginas";

// "Stel je eigen vragenlijst samen" in het Engels (/en/samenstellen), deel 6b. De
// voorbeeldvragen zijn vertaald en heten ook hier een voorbeeld; de knop neemt de
// keuze mee naar de demo-aanvraag in deze taal. Er wordt niets bewaard.
// ?vragen=<id's>&eigen=<tekst> zet een keuze klaar; wat niet klopt valt weg.
export const dynamic = "force-dynamic";

const TAAL = "en";
const t = TEKSTEN[TAAL];

export const metadata: Metadata = {
  title: { absolute: t.meta.samenstellenTitel },
  description: t.meta.samenstellenOmschrijving,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default async function SmileyappSamenstellenEnglish({ searchParams }: { searchParams: Promise<{ vragen?: string | string[]; eigen?: string | string[] }> }) {
  const begin = keuzeUitZoek(await searchParams);
  return (
    <div lang="en">
      <PaginaHero boven={t.samenstel.boven} sub={vul(t.samenstel.intro, { max: KEUZE_MAX })}>
        <h1 className={DEMO_KOP_KLASSE}>{t.samenstel.kop}</h1>
      </PaginaHero>
      <SamenstellenTaal taal={TAAL} begin={begin} />
    </div>
  );
}
