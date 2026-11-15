import Image from "next/image";
import Link from "next/link";
import { AANBOD, aanbodHref, type AanbodItem, type Pijler } from "@/lib/marketing/aanbod";
import type { Uitgebreid } from "@/lib/marketing/aanbod-uitgebreid";
import { AanwezigKaart, IncheckKaart, LocatieTegels, Plaat } from "@/components/marketing/aanbod/Illustraties";

// De uitgebreide aanbodpagina (lib/marketing/aanbod-uitgebreid.ts): lichte kop met kruimelpad en illustratie, daarna
// afwisselend beeld en tekst, kaarten met andere functies en een afsluitend blok. Servercomponent, geen scripts.

const PLATEN = ["incheck", "rooster", "uren"] as const;

function Vink() {
  return (
    <span aria-hidden className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
      ✓
    </span>
  );
}

export function AanbodUitgebreid({ a, pijler, u }: { a: AanbodItem; pijler: Pijler; u: Uitgebreid }) {
  const andere = u.andere.map((s) => AANBOD.find((x) => x.slug === s)).filter((x): x is AanbodItem => x !== undefined);
  return (
    <>
      <section className="bg-white">
        <div className="shell py-8 md:py-12">
          <nav aria-label="Kruimelpad" className="text-sm text-neutralx-500">
            <Link href="/" className="hover:underline">ZekerFlex</Link>
            <span aria-hidden className="mx-2">›</span>
            <Link href="/aanbod" className="hover:underline">Aanbod</Link>
            <span aria-hidden className="mx-2">›</span>
            <Link href={`/aanbod#${pijler.sleutel}`} className="hover:underline">{pijler.naam}</Link>
            <span aria-hidden className="mx-2">›</span>
            <span className="text-ink">{a.naam}</span>
          </nav>
          <div className="mt-10 grid items-center gap-10 pb-6 lg:grid-cols-2 lg:pb-16">
            <div>
              <h1 className="text-balance font-display text-4xl font-bold leading-[1.1] text-ink md:text-6xl">{a.naam}</h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutralx-600">{a.kort}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={a.start.href} className="btn-primary px-6 py-3">{a.start.label}</Link>
                <Link href="/demo" className="btn-ghost px-6 py-3">Plan een demo</Link>
              </div>
            </div>
            <div className="relative mx-auto flex w-full max-w-md justify-center py-6">
              <span aria-hidden className="absolute inset-x-6 inset-y-0 rounded-[3rem] bg-mintwash" />
              <IncheckKaart className="relative -rotate-2" />
              <AanwezigKaart className="absolute -bottom-2 -right-2 hidden !max-w-[14rem] !p-3 rotate-2 sm:block" />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-paper-soft" aria-labelledby="intro-kop">
        <div className="shell grid items-center gap-12 py-16 md:py-24 lg:grid-cols-2">
          <div className="relative mx-auto w-full max-w-lg">
            <span aria-hidden className="absolute -left-6 -top-6 h-40 w-40 rounded-full border-[14px] border-brand-mint/50" />
            <span aria-hidden className="absolute -bottom-6 right-4 h-44 w-56 rounded-[3rem] bg-brand-100" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-xl">
              {/* foto in public/aanbod (bron en licentie in CREDITS.md) */}
              <Image src={`/aanbod/${u.foto.bestand}`} alt={u.foto.alt} fill sizes="(max-width: 1024px) 100vw, 520px" className="object-cover" />
            </div>
            <IncheckKaart className="absolute -bottom-10 -right-2 !w-48 !p-3 sm:-right-8" />
          </div>
          <div>
            <h2 id="intro-kop" className="text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">{u.intro.kop}</h2>
            <div className="mt-6 space-y-4 leading-relaxed text-neutralx-600">
              {u.intro.alinea.map((t) => <p key={t}>{t}</p>)}
            </div>
            <Link href={a.start.href} className="btn-primary mt-8 inline-block px-6 py-3">{u.intro.knop}</Link>
          </div>
        </div>
      </section>

      <section className="bg-white" aria-labelledby="voordelen-kop">
        <div className="shell grid items-center gap-12 py-16 md:py-24 lg:grid-cols-2">
          <div>
            <h2 id="voordelen-kop" className="text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">{u.voordelen.kop}</h2>
            <p className="mt-4 leading-relaxed text-neutralx-600">{u.voordelen.intro}</p>
            <ul className="mt-6 space-y-3">
              {u.voordelen.punten.map((p) => (
                <li key={p} className="flex items-center gap-3 font-medium text-ink">
                  <Vink />
                  {p}
                </li>
              ))}
            </ul>
            <Link href={a.start.href} className="btn-primary mt-8 inline-block px-6 py-3">{u.voordelen.knop}</Link>
          </div>
          <div className="relative mx-auto flex w-full max-w-md flex-col items-center gap-6 rounded-[2rem] bg-mintwash p-8">
            <IncheckKaart />
            <LocatieTegels className="w-full" />
          </div>
        </div>
      </section>

      <section className="bg-paper-soft" aria-labelledby="hoe-kop">
        <div className="shell grid items-center gap-12 py-16 md:py-24 lg:grid-cols-2">
          <div className="mx-auto flex w-full max-w-md justify-center rounded-[2rem] bg-white p-8 shadow-inner-hair">
            <AanwezigKaart className="!shadow-lg" />
          </div>
          <div>
            <h2 id="hoe-kop" className="text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">{u.hoe.kop}</h2>
            <div className="mt-6 space-y-4 leading-relaxed text-neutralx-600">
              {u.hoe.alinea.map((t) => <p key={t}>{t}</p>)}
            </div>
            <Link href={a.start.href} className="btn-primary mt-8 inline-block px-6 py-3">{u.hoe.knop}</Link>
          </div>
        </div>
      </section>

      <section className="bg-white" aria-labelledby="andere-kop">
        <div className="shell py-16 md:py-24">
          <h2 id="andere-kop" className="text-center font-display text-3xl font-bold text-ink md:text-5xl">Andere functionaliteiten</h2>
          <ul className="mt-12 grid gap-6 md:grid-cols-3">
            {andere.map((x, i) => (
              <li key={x.slug} className="flex flex-col overflow-hidden rounded-2xl border border-hair bg-white shadow-lg">
                <Plaat soort={PLATEN[i % PLATEN.length] ?? "incheck"} />
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="font-display text-xl font-bold text-ink">{x.naam}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-neutralx-600">{x.kort}</p>
                  <Link href={aanbodHref(x)} className="btn-ghost mt-6 self-start px-5 py-2 text-sm">Lees meer</Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white pb-16 md:pb-24" aria-labelledby="slot-kop">
        <div className="shell">
          <div className="hero-ink rounded-3xl px-6 py-12 text-center text-white md:px-12 md:py-16">
            <h2 id="slot-kop" className="font-display text-3xl font-bold md:text-4xl">{u.slot.kop}</h2>
            <ul className="mx-auto mt-8 flex max-w-3xl flex-col items-start gap-4 text-left sm:flex-row sm:justify-center sm:gap-8">
              {u.slot.checks.map((c) => (
                <li key={c} className="flex items-start gap-3 text-white/85">
                  <span aria-hidden className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-mint text-xs font-bold text-ink">✓</span>
                  {c}
                </li>
              ))}
            </ul>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link href={a.start.href} className="btn-mint px-6 py-3">{a.start.label}</Link>
              <Link href="/demo" className="btn-ghost-invert px-6 py-3">Plan een demo</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
