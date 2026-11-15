import Link from "next/link";
import { AANBOD, aanbodHref, type AanbodItem } from "@/lib/marketing/aanbod";
import type { Redactioneel } from "@/lib/marketing/aanbod-redactioneel";

// De rustige, redactionele aanbodpagina (lib/marketing/aanbod-redactioneel.ts): veel wit, grote lichte koppen, links de vraag en
// rechts het antwoord, drie kolommen zonder kaarten en de veelgestelde vragen als uitklappers. Servercomponent, geen scripts:
// de uitklappers zijn gewone details-elementen.

const KNOP = "inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition-colors";

export function AanbodRedactioneel({ a, r }: { a: AanbodItem; r: Redactioneel }) {
  const rest = r.rest.items
    .map((i) => ({ ...i, item: AANBOD.find((x) => x.slug === i.slug) }))
    .filter((i): i is typeof i & { item: AanbodItem } => i.item !== undefined);
  return (
    <div className="bg-paper text-ink">
      <section aria-labelledby="hero-kop" className="shell py-16 md:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.25fr_0.75fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutralx-500">{a.naam}</p>
            <h1 id="hero-kop" className="mt-5 text-balance font-display text-4xl font-medium leading-[1.08] tracking-tight md:text-6xl">
              {r.hero.kop}
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-neutralx-600">{r.hero.tekst}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={r.hero.knop.href} className={`${KNOP} bg-ink text-white hover:bg-neutralx-800`}>
                {r.hero.knop.label}
              </Link>
              <Link href={r.hero.tweede.href} className={`${KNOP} border border-hairstrong bg-white text-ink hover:bg-paper-soft`}>
                {r.hero.tweede.label}
              </Link>
            </div>
            <p className="mt-5 max-w-xl text-sm text-neutralx-500">{r.hero.noot}</p>
          </div>
          <div aria-hidden className="relative mx-auto w-full max-w-sm rounded-2xl border border-hair bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-medium">{r.kaart.titel}</p>
              <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutralx-500">{r.kaart.badge}</span>
            </div>
            <dl className="mt-5 divide-y divide-hair rounded-xl border border-hair">
              {r.kaart.regels.map((k) => (
                <div key={k.label} className="px-4 py-3">
                  <dt className="text-xs text-neutralx-500">{k.label}</dt>
                  <dd className="mt-0.5 text-sm font-medium">{k.waarde}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section aria-labelledby="verschil-kop" className="border-t border-hair">
        <div className="shell grid gap-8 py-16 md:py-24 lg:grid-cols-2 lg:gap-16">
          <h2 id="verschil-kop" className="text-balance font-display text-3xl font-medium leading-tight tracking-tight md:text-4xl">{r.verschil.kop}</h2>
          <p className="leading-relaxed text-neutralx-600">{r.verschil.tekst}</p>
        </div>
      </section>

      <section aria-labelledby="drie-kop" className="border-t border-hair">
        <div className="shell py-16 md:py-24">
          <h2 id="drie-kop" className="max-w-2xl text-balance font-display text-3xl font-medium leading-tight tracking-tight md:text-4xl">{r.drie.kop}</h2>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {r.drie.kolommen.map((k) => (
              <div key={k.kop}>
                <h3 className="font-display text-lg font-medium">{k.kop}</h3>
                <p className="mt-3 text-sm leading-relaxed text-neutralx-600">{k.tekst}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="regels-kop" className="border-t border-hair">
        <div className="shell py-16 md:py-24">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <h2 id="regels-kop" className="text-balance font-display text-3xl font-medium leading-tight tracking-tight md:text-4xl">{r.regels.kop}</h2>
            <p className="leading-relaxed text-neutralx-600">{r.regels.tekst}</p>
          </div>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {r.regels.kolommen.map((k) => (
              <div key={k.kop}>
                <h3 className="text-xs font-medium uppercase tracking-wide text-neutralx-500">{k.kop}</h3>
                <p className="mt-3 text-sm leading-relaxed text-neutralx-600">{k.tekst}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="vragen-kop" className="border-t border-hair">
        <div className="shell py-16 md:py-24">
          <h2 id="vragen-kop" className="font-display text-3xl font-medium tracking-tight md:text-4xl">{r.vragen.kop}</h2>
          <div className="mt-10 divide-y divide-hair border-y border-hair">
            {r.vragen.items.map((v) => (
              <details key={v.vraag} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                  {v.vraag}
                  <span aria-hidden className="text-neutralx-500 transition-transform group-open:rotate-180">⌄</span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-neutralx-600">{v.antwoord}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {rest.length > 0 && (
        <section aria-labelledby="rest-kop" className="border-t border-hair">
          <div className="shell grid gap-8 py-16 md:py-24 lg:grid-cols-2 lg:gap-16">
            <h2 id="rest-kop" className="text-balance font-display text-3xl font-medium leading-tight tracking-tight md:text-4xl">{r.rest.kop}</h2>
            <ul className="space-y-4 text-sm leading-relaxed text-neutralx-600">
              {rest.map((i) => (
                <li key={i.slug}>
                  <Link href={aanbodHref(i.item)} className="font-medium text-ink underline underline-offset-4">
                    {i.item.naam}
                  </Link>{" — "}
                  {i.tekst}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section aria-labelledby="slot-kop" className="border-t border-hair">
        <div className="shell py-20 text-center md:py-28">
          <h2 id="slot-kop" className="mx-auto max-w-3xl text-balance font-display text-4xl font-medium leading-[1.1] tracking-tight md:text-6xl">{r.slot.kop}</h2>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href={r.hero.knop.href} className={`${KNOP} bg-ink text-white hover:bg-neutralx-800`}>
              {r.hero.knop.label}
            </Link>
            <Link href={r.hero.tweede.href} className={`${KNOP} border border-hairstrong bg-white text-ink hover:bg-paper-soft`}>
              {r.hero.tweede.label}
            </Link>
          </div>
          <ul className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-2 text-xs text-neutralx-500">
            {r.slot.kanalen.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
