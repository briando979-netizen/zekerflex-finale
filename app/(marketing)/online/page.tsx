import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FaqList } from "@/components/marketing/primitives";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { ALLE_ONLINE_TOOLS, ONLINE_FAQ, ONLINE_GROEPEN, WAAROM_HIER, ZO_WERKT_HET } from "@/lib/marketing/online-tools";
import { VOORBEELDEN } from "@/lib/website/aanvraag-opties";

const DESCRIPTION = "Website maken, webshop openen, logo ontwerpen, domeinnaam registreren, verhuizen of beheren, zakelijke e-mail, gratis checks en meer. Alle online tools van ZekerFlex op één pagina.";

export const metadata: Metadata = {
  title: "Alles voor je bedrijf online",
  description: DESCRIPTION,
  ...canonical("/online"),
};

// /online (19 nov 2026, eigenaar): alle losse online tools op één pagina, opgezet als de startpagina van een
// websitebouwer maar in onze eigen stijl: een duidelijke kop, de echte voorbeelden, alle tools in groepen met een
// knop die meteen doet wat hij zegt, hoe het werkt, waarom hier, en vragen. Elke tool komt uit lib/marketing/online-tools.ts
// (afgeleid van het aanbod), dus elke knop bestaat echt. Geen verzonnen aantallen, sterren of prijzen.

const START = "/website-maken";

export default function OnlinePagina() {
  const fotos = VOORBEELDEN.slice(0, 4);
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbJsonLd([["Home", "/"], ["Alles voor je bedrijf online", "/online"]])) }} />

      {/* kop: belofte, twee knoppen, en de echte voorbeelden als collage */}
      <div className="hero-ink text-white">
        <div className="shell grid gap-10 py-14 md:py-20 lg:grid-cols-[1.1fr_minmax(0,30rem)] lg:items-center lg:gap-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Alles voor je bedrijf online</p>
            <h1 className="mt-3 text-balance font-display text-4xl font-bold leading-tight md:text-6xl">
              Website, webshop, logo en domein. <span className="text-brand-mint">Eerst zien, dan betalen.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/80">
              Alle losse tools om je bedrijf online te zetten, op één plek. Je kiest wat je nu nodig hebt, ziet meteen resultaat en betaalt alleen voor wat je afneemt.
              Alles draait op onze eigen servers in Nederland, zonder cookies van anderen.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={START} className="btn-mint px-6 py-3 text-base">
                Begin met je website
              </Link>
              <a href="#tools" className="btn-ghost-invert px-6 py-3 text-base">
                Bekijk alle tools
              </a>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
              <li>✓ Geen account nodig voor de checks</li>
              <li>✓ Eigen domeinnaam</li>
              <li>✓ Een mens kijkt mee</li>
              <li>✓ Geen pakket dat je moet afnemen</li>
            </ul>
          </div>
          <ul className="grid grid-cols-2 gap-3" aria-label="Websites en apps die we maakten">
            {fotos.map((v, i) => (
              <li key={v.id} className={`surface relative overflow-hidden ${i % 3 === 0 ? "rotate-[-1.5deg]" : "rotate-[1deg]"}`}>
                <div className="relative aspect-[8/5] bg-paper-soft">
                  <Image src={v.foto} alt={`${v.naam}, gemaakt door ZekerFlex`} fill sizes="(min-width: 1024px) 15vw, 45vw" className="object-cover object-top" />
                </div>
                <p className="px-3 py-2 text-xs font-semibold text-ink">{v.naam}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* alle tools, per groep */}
      <section id="tools" className="scroll-mt-24 bg-paper" aria-labelledby="tools-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Alle tools</p>
          <h2 id="tools-kop" className="mt-3 font-display text-3xl font-bold text-ink md:text-4xl">
            Kies wat je nu nodig hebt
          </h2>
          <p className="mt-3 max-w-2xl text-neutralx-600">
            {ALLE_ONLINE_TOOLS.length} tools, allemaal van onszelf. Elke knop doet meteen wat hij zegt.
          </p>
          <div className="mt-10 space-y-14">
            {ONLINE_GROEPEN.map((g) => (
              <div key={g.sleutel} id={g.sleutel} className="scroll-mt-24">
                <h3 className="font-display text-2xl font-bold text-ink">{g.titel}</h3>
                <p className="mt-1 text-neutralx-600">{g.intro}</p>
                <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {g.tools.map((t) => (
                    <li key={t.sleutel} className="surface flex flex-col gap-3 p-5">
                      <div className="flex items-center gap-3">
                        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-2xl">
                          {t.icoon}
                        </span>
                        <h4 className="font-display text-lg font-bold leading-tight text-ink">{t.naam}</h4>
                      </div>
                      <p className="flex-1 text-sm leading-relaxed text-neutralx-600">{t.kort}</p>
                      {t.prijs ? <p className="text-xs font-semibold text-brand-700">{t.prijs}</p> : null}
                      {t.extern ? (
                        <a href={t.href} target="_blank" rel="noopener noreferrer" className="btn-primary px-4 py-2 text-sm">
                          {t.knop}
                        </a>
                      ) : (
                        <Link href={t.href} className="btn-primary px-4 py-2 text-sm">
                          {t.knop}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* zo werkt het */}
      <section className="bg-white" aria-labelledby="werkt-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Zo werkt het</p>
          <h2 id="werkt-kop" className="mt-3 font-display text-3xl font-bold text-ink md:text-4xl">
            Drie stappen, geen verrassingen
          </h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {ZO_WERKT_HET.map((s, i) => (
              <li key={s.titel} className="surface p-6">
                <span className="num inline-grid h-10 w-10 place-items-center rounded-full bg-ink font-display text-lg font-bold text-white">{i + 1}</span>
                <h3 className="mt-4 font-display text-xl font-bold text-ink">{s.titel}</h3>
                <p className="mt-2 text-neutralx-600">{s.tekst}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* waarom hier */}
      <section className="bg-paper" aria-labelledby="waarom-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Waarom hier</p>
          <h2 id="waarom-kop" className="mt-3 font-display text-3xl font-bold text-ink md:text-4xl">
            Meer dan een websitebouwer
          </h2>
          <ul className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {WAAROM_HIER.map((w) => (
              <li key={w.titel} className="rounded-2xl border border-hair bg-white p-6">
                <h3 className="font-display text-lg font-bold text-ink">{w.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{w.tekst}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* vragen */}
      <section className="bg-white" aria-labelledby="faq-kop">
        <div className="shell py-14 md:py-20">
          <h2 id="faq-kop" className="font-display text-3xl font-bold text-ink md:text-4xl">
            Veelgestelde vragen
          </h2>
          <div className="mt-6 max-w-3xl">
            <FaqList items={ONLINE_FAQ} />
          </div>
        </div>
      </section>

      {/* slot */}
      <section className="hero-ink text-white" aria-labelledby="begin-kop">
        <div className="shell py-14 md:py-20">
          <h2 id="begin-kop" className="font-display text-3xl font-bold md:text-4xl">
            Begin vandaag, betaal pas als het goed is
          </h2>
          <p className="mt-3 max-w-2xl text-white/80">
            Vertel je wensen voor een website of webshop en krijg binnen een dag een voorbeeld in drie versies. Of begin klein: een logo, een domeinnaam of een gratis check.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={START} className="btn-mint px-6 py-3 text-base">
              Vertel je wensen
            </Link>
            <a href="#tools" className="btn-ghost-invert px-6 py-3 text-base">
              Terug naar de tools
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
