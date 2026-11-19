import type { Metadata } from "next";
import { BASE } from "@/lib/voorstel/smileyapp";
import { VERGELIJK_NL } from "@/lib/voorstel/smileyapp-teksten";
import { vergelijkRijen } from "@/lib/voorstel/smileyapp-vergelijken";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";
import { VergelijkSlot, VergelijkTabel } from "@/components/voorstel/smileyapp/VergelijkTabel";

// dynamisch: de rijen volgen wat het team in het beheer toevoegt of verbergt
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Smileyapp of een papieren enquête?", description: "Smileyapp en een papieren enquête naast elkaar." };

// Vergelijken (deel 6b): Smileyapp naast een papieren enquête. In de kolom
// Smileyapp staan alleen zinnen van smileyapp.nl; de kolom papier beschrijft
// hoe een papieren formulier werkt, zonder cijfers en zonder een merk te noemen
// (lib/voorstel/smileyapp-vergelijk-regels.ts). Eigen rijen van het team komen
// uit het beheer.
const t = VERGELIJK_NL;

export default async function SmileyappVergelijken() {
  const rijen = await vergelijkRijen();
  return (
    <>
      <section className="relative overflow-hidden bg-smiley-ink text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-smiley-green/25 blur-3xl" />
        <Gezicht score={10} kleur="#5ABA8E" accent="#FDD11A" knipoog className="sm-zweef pointer-events-none absolute -right-10 top-8 h-48 w-48 opacity-25 sm:right-16" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun">{t.boven}</p>
          <h1 className="mt-3 max-w-3xl break-words font-display text-[clamp(2.2rem,6vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.02em] [hyphens:auto] md:[hyphens:manual]">{t.kop}</h1>
          <p className="mt-5 max-w-2xl text-xl font-semibold leading-relaxed text-smiley-green">{t.intro}</p>
        </div>
      </section>
      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-20">
        <VergelijkTabel rijen={rijen} teksten={t} />
      </section>
      <VergelijkSlot basis={BASE} teksten={t} />
    </>
  );
}
