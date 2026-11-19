import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BASE, STAPPEN, VIDEO } from "@/lib/voorstel/smileyapp";
import { BRANCHE_LIJST, SOORT_LABEL, VOORBEELD_LABEL, branche, brancheLink, quotesVoor, type Vraagsoort } from "@/lib/voorstel/smileyapp-branches";
import { brancheKeuze, keuzeNaarZoek } from "@/lib/voorstel/smileyapp-samensteller";
import { Vinkje } from "@/components/voorstel/smileyapp/Blokken";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";

// Eén branche (19 nov 2026): een algemene inleiding, de momenten waarop je kunt
// meten en een voorbeeldvragenlijst van vijf vragen. Het voorbeeld is van
// ZekerFlex en heet ook zo; de soorten vragen zijn die van smileyapp.nl. Een
// onbekende slug bestaat niet (branche() kijkt met Object.hasOwn in de vaste lijst).
// Dynamisch, zoals de rest van het voorstel: de layout leest de kop van het subdomein.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const b = branche((await params).slug);
  return b ? { title: b.kop, description: b.intro[0] ?? "" } : {};
}

/** Hoe een soort vraag eruitziet voor wie hem invult: alleen een tekening, er valt niets in te vullen. */
function Antwoordvak({ soort }: { soort: Vraagsoort }) {
  if (soort === "1-10 rating vragen") {
    return (
      <div aria-hidden="true" className="mt-3 flex items-center gap-1.5">
        {[2, 4, 6, 8, 10].map((s) => (
          <Gezicht key={s} score={s} className={s === 8 ? "h-9 w-9" : "h-6 w-6 opacity-50"} />
        ))}
        <span className="ml-2 font-display text-xl font-bold">8</span>
      </div>
    );
  }
  if (soort === "ja/nee vragen") {
    return (
      <div aria-hidden="true" className="mt-3 flex gap-2 text-sm font-bold">
        <span className="rounded-full bg-smiley-ink px-4 py-1.5 text-white">Ja</span>
        <span className="rounded-full px-4 py-1.5 ring-1 ring-smiley-ink/20">Nee</span>
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="mt-3 space-y-2 rounded-2xl bg-smiley-cream p-3 ring-1 ring-smiley-ink/10">
      <span className="block h-2 w-4/5 rounded-full bg-smiley-ink/15" />
      <span className="block h-2 w-3/5 rounded-full bg-smiley-ink/15" />
    </div>
  );
}

export default async function SmileyappBranche({ params }: { params: Promise<{ slug: string }> }) {
  const b = branche((await params).slug);
  if (!b) notFound();
  const quotes = quotesVoor(b.slug);
  const andere = BRANCHE_LIJST.filter((x) => x.slug !== b.slug);
  return (
    <>
      <section className="relative overflow-hidden bg-smiley-ink text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-smiley-green/25 blur-3xl" />
        <Gezicht score={b.smiley} kleur="#5ABA8E" accent="#FDD11A" knipoog className="sm-zweef pointer-events-none absolute -right-10 bottom-4 h-44 w-44 opacity-25 sm:right-16" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-14 sm:px-8 lg:py-20">
          <Link href={`${BASE}/branches`} className="text-sm font-bold text-smiley-sun hover:underline">
            ← Alle branches
          </Link>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun">{b.naam}</p>
          <h1 className="mt-3 max-w-3xl break-words font-display text-[clamp(2rem,6vw,4rem)] font-bold leading-[1.04] tracking-[-0.02em]">{b.kop}</h1>
          <Link href={`${BASE}/demo`} className="mt-8 inline-flex rounded-full bg-smiley-sun px-7 py-4 font-bold text-smiley-ink transition-transform hover:-translate-y-0.5">
            Vraag een demo aan
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <div className="sm-onthul">
          <div className="space-y-4 text-lg leading-relaxed text-smiley-mute">
            {b.intro.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </div>
          <p className="mt-6 rounded-2xl bg-white p-5 leading-relaxed ring-1 ring-smiley-ink/10">{STAPPEN[0]?.tekst}</p>
          {b.slug === "horeca" && (
            <p className="mt-4 text-sm leading-relaxed text-smiley-mute">
              Het animatiefilmpje op de voorpagina laat zien hoe Smileyapp in de horeca kan werken.{" "}
              <Link href={`${BASE}#video`} className="font-semibold text-smiley-leaf underline underline-offset-2">
                Bekijk de video ({VIDEO.duur})
              </Link>
              .
            </p>
          )}
        </div>
        <div className="sm-onthul rounded-[2rem] bg-smiley-mint p-6 sm:p-8">
          <h2 className="font-display text-2xl font-bold">Waar meet je?</h2>
          <ul className="mt-5 space-y-3">
            {b.momenten.map((m) => (
              <li key={m} className="flex gap-3 font-semibold">
                <Vinkje />
                {m}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="voorbeeld-kop" className="bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <p className="inline-flex rounded-full bg-smiley-sun px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-smiley-ink">{VOORBEELD_LABEL}</p>
          <h2 id="voorbeeld-kop" className="mt-4 break-words font-display text-3xl font-bold leading-tight [hyphens:auto] sm:text-4xl md:[hyphens:manual]">
            Voorbeeldvragenlijst voor {b.naam.toLowerCase()}
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-smiley-mute">Vijf vragen als startpunt. Het is een voorbeeld van ZekerFlex, geen vragenlijst van een klant van Smileyapp.</p>
          <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {b.vragen.map((v, i) => (
              <li key={v.tekst} className="sm-onthul rounded-[2rem] bg-smiley-cream p-6 ring-1 ring-smiley-ink/5">
                <div className="flex items-center justify-between gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-smiley-ink font-display font-bold text-smiley-sun">{i + 1}</span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-smiley-leaf ring-1 ring-smiley-leaf/20">{SOORT_LABEL[v.soort]}</span>
                </div>
                <p className="mt-4 font-display text-lg font-bold leading-snug">{v.tekst}</p>
                <Antwoordvak soort={v.soort} />
              </li>
            ))}
          </ol>
          {/* deel 6b: met deze vijf vragen verder in de samensteller */}
          <Link href={`${BASE}/samenstellen?${keuzeNaarZoek({ ids: brancheKeuze(b.slug), eigen: "" })}`} className="mt-8 inline-flex rounded-full px-6 py-3 font-bold text-smiley-ink ring-1 ring-smiley-ink/20 hover:bg-smiley-mint">
            Stel je eigen vragenlijst samen
          </Link>
        </div>
      </section>

      {quotes.length > 0 && (
        <section aria-labelledby="ervaring-kop" className="py-16 lg:py-20">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
            <h2 id="ervaring-kop" className="font-display text-3xl font-bold leading-tight sm:text-4xl">
              Wat klanten in het onderwijs zeggen
            </h2>
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {quotes.map((q) => (
                <figure key={q.naam} className="sm-onthul rounded-[2rem] bg-white p-7 ring-1 ring-smiley-ink/10 sm:p-9">
                  <blockquote className="space-y-4 text-lg leading-relaxed">
                    {q.tekst.map((t) => (
                      <p key={t}>{t}</p>
                    ))}
                  </blockquote>
                  <figcaption className="mt-7 flex items-center gap-4">
                    <Image src={q.beeld} alt="" width={120} height={120} className="h-14 w-14 rounded-full" />
                    <span>
                      <span className="block font-bold">{q.naam}</span>
                      <span className="block text-sm text-smiley-mute">{q.organisatie}</span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
            <Link href={`${BASE}/klanten`} className="mt-8 inline-flex rounded-full px-6 py-3 font-bold text-smiley-ink ring-1 ring-smiley-ink/20 hover:bg-smiley-mint">
              Lees de verhalen
            </Link>
          </div>
        </section>
      )}

      <section className="bg-smiley-sun">
        <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-8">
          <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
            <p className="max-w-2xl font-display text-2xl font-bold leading-snug sm:text-3xl">Benieuwd hoe dit er voor jouw organisatie uitziet?</p>
            <Link href={`${BASE}/demo`} className="shrink-0 rounded-full bg-smiley-ink px-8 py-4 font-bold text-white transition-transform hover:-translate-y-0.5">
              Vraag een demo aan
            </Link>
          </div>
          <nav aria-label="Andere branches" className="mt-8">
            <ul className="flex flex-wrap gap-2">
              {andere.map((x) => (
                <li key={x.slug}>
                  <Link href={brancheLink(x.slug)} className="inline-flex rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-smiley-ink hover:bg-white">
                    {x.naam}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>
    </>
  );
}
