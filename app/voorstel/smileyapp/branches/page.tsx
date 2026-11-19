import type { Metadata } from "next";
import Link from "next/link";
import { BASE, VIDEO } from "@/lib/voorstel/smileyapp";
import { BRANCHE_LIJST, brancheLink } from "@/lib/voorstel/smileyapp-branches";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";

export const metadata: Metadata = { title: "Branches" };

// Overzicht van de branchepagina's (19 nov 2026). Op smileyapp.nl staat dat
// Smileyapp voor alle branches inzetbaar is; hier vijf voorbeelden, elk met een
// voorbeeldvragenlijst van ZekerFlex (zie lib/voorstel/smileyapp-branches.ts).
const KAART = ["bg-smiley-sun", "bg-smiley-green", "bg-white ring-1 ring-smiley-ink/10", "bg-smiley-mint", "bg-smiley-sun"] as const;

export default function SmileyappBranches() {
  return (
    <>
      <section className="relative overflow-hidden bg-smiley-ink text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-smiley-green/25 blur-3xl" />
        <Gezicht score={10} kleur="#FDD11A" knipoog className="sm-zweef pointer-events-none absolute -right-10 top-8 h-48 w-48 opacity-25 sm:right-16" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun">Branches</p>
          <h1 className="mt-3 max-w-3xl font-display text-[clamp(2.2rem,6vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.02em]">{VIDEO.bovenkop}</h1>
          <p className="mt-5 max-w-2xl text-xl font-semibold leading-relaxed text-smiley-green">Vijf voorbeelden van waar je kunt meten en wat je kunt vragen.</p>
        </div>
      </section>
      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-20">
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {BRANCHE_LIJST.map((b, i) => (
            <li key={b.slug} className="sm-onthul">
              <Link href={brancheLink(b.slug)} className={`sm-til flex h-full flex-col rounded-[2rem] p-7 text-smiley-ink ${KAART[i % KAART.length] ?? KAART[0]}`}>
                <Gezicht score={b.smiley} kleur="#0E2A20" knipoog className="sm-wiebel h-14 w-14" />
                <h2 className="mt-5 break-words font-display text-3xl font-bold leading-tight">{b.naam}</h2>
                <p className="mt-3 leading-relaxed">{b.intro[0]}</p>
                <span className="mt-auto pt-6 font-bold">
                  Bekijk het voorbeeld<span className="sr-only"> voor {b.naam.toLowerCase()}</span> →
                </span>
              </Link>
            </li>
          ))}
          <li className="sm-onthul">
            <div className="flex h-full flex-col rounded-[2rem] bg-smiley-ink p-7 text-white">
              <h2 className="font-display text-3xl font-bold leading-tight">Staat jouw branche er niet bij?</h2>
              <p className="mt-3 leading-relaxed text-white/80">{VIDEO.bovenkop}. Vraag een demo aan, dan kijken we samen wat past.</p>
              <Link href={`${BASE}/demo`} className="mt-auto inline-flex w-fit rounded-full bg-smiley-sun px-6 py-3.5 font-bold text-smiley-ink transition-transform hover:-translate-y-0.5">
                Vraag een demo aan
              </Link>
            </div>
          </li>
        </ul>
      </section>
    </>
  );
}
