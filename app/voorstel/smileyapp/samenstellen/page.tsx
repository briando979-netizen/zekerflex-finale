import type { Metadata } from "next";
import { BASE } from "@/lib/voorstel/smileyapp";
import { KEUZEVRAGEN, KEUZE_MAX, keuzeUitZoek } from "@/lib/voorstel/smileyapp-samensteller";
import { SAMENSTEL_NL, vul } from "@/lib/voorstel/smileyapp-teksten";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";
import { RekenBlok } from "@/components/voorstel/smileyapp/RekenBlok";
import { Samensteller } from "@/components/voorstel/smileyapp/Samensteller";

// dynamisch: de rekenhulp onderaan volgt wat een beheerder in het beheer invult (zonder instelling staat hij er niet)
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stel je eigen vragenlijst samen", description: "Kies voorbeeldvragen en bekijk hoe je vragenlijst eruitziet op een telefoon." };

// Vragenlijst zelf samenstellen (deel 6b): de bezoeker kiest hooguit vijf
// voorbeeldvragen (die van de branchepagina's, elk een voorbeeld van ZekerFlex)
// en typt er als hij wil één eigen vraag bij; ernaast staat het scherm van de
// app op een telefoon. Er wordt niets bewaard: de knop neemt de keuze in de
// adresbalk mee naar de demo-aanvraag. ?vragen=<id's>&eigen=<tekst> zet een
// keuze alvast klaar (de link van een branchepagina); wat niet klopt valt weg.
const t = SAMENSTEL_NL;

export default async function SmileyappSamenstellen({ searchParams }: { searchParams: Promise<{ vragen?: string | string[]; eigen?: string | string[] }> }) {
  const begin = keuzeUitZoek(await searchParams);
  return (
    <>
      <section className="relative overflow-hidden bg-smiley-ink text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-smiley-green/25 blur-3xl" />
        <Gezicht score={10} kleur="#FDD11A" knipoog className="sm-zweef pointer-events-none absolute -right-10 top-8 h-48 w-48 opacity-25 sm:right-16" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun">{t.boven}</p>
          <h1 className="mt-3 max-w-3xl break-words font-display text-[clamp(2.2rem,6vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.02em] [hyphens:auto] md:[hyphens:manual]">{t.kop}</h1>
          <p className="mt-5 max-w-2xl text-xl font-semibold leading-relaxed text-smiley-green">{vul(t.intro, { max: KEUZE_MAX })}</p>
        </div>
      </section>
      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-20">
        <Samensteller vragen={KEUZEVRAGEN.map(({ id, groep, soort, tekst }) => ({ id, groep, soort, tekst }))} demoPad={`${BASE}/demo`} begin={begin} />
      </section>
      {/* de rekenhulp: alleen als een beheerder een responspercentage met een bron heeft ingevuld */}
      <RekenBlok />
    </>
  );
}
