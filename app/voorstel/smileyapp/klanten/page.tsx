import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BASE, KLANTEN } from "@/lib/voorstel/smileyapp";
import { VERHALEN } from "@/lib/voorstel/smileyapp-klanten";
import { Vinkje } from "@/components/voorstel/smileyapp/Blokken";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";

export const metadata: Metadata = { title: "Klantverhalen" };

// Klantverhalen (19 nov 2026): de twee quotes van smileyapp.nl, uitgewerkt met
// alleen wat in de quote zelf staat (lib/voorstel/smileyapp-klanten.ts), en
// daaronder de logo's uit hun blok "Case". Geen resultaten of cijfers: die
// staan niet op hun site.
export default function SmileyappKlanten() {
  return (
    <>
      <section className="relative overflow-hidden bg-smiley-ink text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-smiley-green/25 blur-3xl" />
        <Gezicht score={10} kleur="#5ABA8E" accent="#FDD11A" knipoog className="sm-zweef pointer-events-none absolute -right-10 top-8 h-48 w-48 opacity-25 sm:right-16" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun">Klantverhalen</p>
          <h1 className="mt-3 max-w-3xl font-display text-[clamp(2.2rem,6vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.02em]">Wat onze klanten zeggen</h1>
          <p className="mt-5 max-w-2xl text-xl font-semibold leading-relaxed text-smiley-green">Twee klanten vertellen in hun eigen woorden waar ze Smileyapp voor gebruiken.</p>
        </div>
      </section>

      <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-16 sm:px-8 lg:py-20">
        {VERHALEN.map((v, i) => (
          <article key={v.id} id={v.id} aria-labelledby={`${v.id}-kop`} className="sm-onthul scroll-mt-24 overflow-hidden rounded-[2rem] bg-white ring-1 ring-smiley-ink/10">
            <div className={`grid lg:grid-cols-[1fr_1.4fr] ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}>
              <div className={`flex flex-col gap-6 p-7 sm:p-10 ${i % 2 === 1 ? "bg-smiley-sun" : "bg-smiley-mint"}`}>
                {v.klant && (
                  <a href={v.klant.url} target="_blank" rel="noopener noreferrer" className="grid h-24 w-full max-w-[240px] place-items-center rounded-3xl bg-white p-4 ring-1 ring-smiley-ink/10">
                    <Image src={v.klant.beeld} alt={`${v.klant.naam} (opent een nieuw venster)`} width={v.klant.breed} height={v.klant.hoog} className="max-h-16 w-auto object-contain" />
                  </a>
                )}
                <div>
                  <h2 id={`${v.id}-kop`} className="break-words font-display text-3xl font-bold leading-tight sm:text-4xl">
                    {v.organisatie}
                  </h2>
                  <p className="mt-3 leading-relaxed">{v.gebruik}</p>
                </div>
                {v.eerst && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em]">Hoe het eerst ging</h3>
                    <p className="mt-2 leading-relaxed">{v.eerst}</p>
                  </div>
                )}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em]">Wat ze meten</h3>
                  <ul className="mt-3 space-y-2.5">
                    {v.meten.map((m) => (
                      <li key={m} className="flex gap-3 font-semibold">
                        <Vinkje />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <figure className="relative p-7 sm:p-10">
                <span aria-hidden="true" className="absolute right-7 top-4 font-display text-8xl font-bold leading-none text-smiley-green/40">
                  &rdquo;
                </span>
                <blockquote className="relative space-y-4 text-lg leading-relaxed sm:text-xl">
                  {v.quote.map((t) => (
                    <p key={t}>{t}</p>
                  ))}
                </blockquote>
                <figcaption className="mt-8 flex items-center gap-4">
                  <Image src={v.beeld} alt="" width={120} height={120} className="h-16 w-16 rounded-full" />
                  <span>
                    <span className="block font-bold">{v.naam}</span>
                    <span className="block text-sm text-smiley-mute">{v.organisatie}</span>
                  </span>
                </figcaption>
              </figure>
            </div>
          </article>
        ))}
      </div>

      <section aria-labelledby="case-kop" className="bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <h2 id="case-kop" className="font-display text-3xl font-bold leading-tight sm:text-4xl">
            Klanten van Smileyapp
          </h2>
          <ul className="sm-onthul mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {KLANTEN.map((k) => (
              <li key={k.naam}>
                <a href={k.url} target="_blank" rel="noopener noreferrer" className="sm-til grid h-28 place-items-center rounded-3xl bg-smiley-cream p-5 ring-1 ring-smiley-ink/10 hover:ring-smiley-green">
                  <Image src={k.beeld} alt={`${k.naam} (opent een nieuw venster)`} width={k.breed} height={k.hoog} className="max-h-16 w-auto object-contain" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-smiley-sun">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 px-4 py-14 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <p className="max-w-2xl font-display text-2xl font-bold leading-snug sm:text-3xl">Ook weten wat jouw klanten, gasten of studenten vinden?</p>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link href={`${BASE}/demo`} className="rounded-full bg-smiley-ink px-8 py-4 font-bold text-white transition-transform hover:-translate-y-0.5">
              Vraag een demo aan
            </Link>
            <Link href={`${BASE}/branches/onderwijs`} className="rounded-full px-8 py-4 font-bold text-smiley-ink ring-2 ring-smiley-ink transition-transform hover:-translate-y-0.5">
              Smileyapp in het onderwijs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
