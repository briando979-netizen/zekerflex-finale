import Link from "next/link";
import { ldJson } from "@/lib/seo/json-ld";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { HeroMetFoto } from "@/components/marketing/HeroMetFoto";
import { LinkRij } from "@/components/marketing/StadCijfers";
import { sectorFoto } from "@/lib/marketing/fotos";
import { breadcrumbJsonLd } from "@/lib/seo";
import { CTA_TEKST, JONGEREN_HINT, JONGEREN_LINK, KNOPPEN } from "@/lib/seo-bijbaan";
import type { Vraag } from "@/lib/seo-stad";
import { WERKEN_ALS_PAD, functieFoto, functiePagina, werkenAlsHub, type Functie, type FunctieRij } from "@/lib/seo-functies";

// /werken-als en /werken-als/<functie> (22 nov 2026): de tekst komt uit lib/seo-functies.ts, het richttarief uit de
// catalogus (lib/shifts/catalogus.ts). Zelfde blokken en klassen als de bijbaan- en branchepagina's
// (components/marketing/BijbaanLanding.tsx, SectorLanding.tsx). Servercomponenten.

const faqJsonLd = (faq: Vraag[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

/** Start vandaag (/welkom) en de app, en de regel voor wie 16 of 17 is (/nog-geen-18). */
function Knoppen() {
  const [eerste, tweede] = KNOPPEN;
  return (
    <>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href={eerste.href} className="btn-primary">
          {eerste.label}
        </Link>
        <Link href={tweede.href} className="btn-ghost">
          {tweede.label}
        </Link>
      </div>
      <p className="mt-5 text-sm text-neutralx-600">
        {JONGEREN_HINT}{" "}
        <Link href={JONGEREN_LINK.href} className="font-semibold text-brand-600 underline">
          {JONGEREN_LINK.label}
        </Link>
      </p>
    </>
  );
}

function Lijst({ kop, items }: { kop: string; items: readonly string[] }) {
  return (
    <div className="rounded-2xl border border-hair bg-white p-5 md:p-6">
      <h2 className="font-display text-xl font-bold text-ink">{kop}</h2>
      <ul className="mt-4 space-y-2 text-[0.975rem] leading-relaxed text-neutralx-600">
        {items.map((t) => (
          <li key={t} className="flex gap-2">
            <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Een rij links met een korte uitleg erboven (de grootste steden: op welk cijfer ze gesorteerd zijn). */
function Rij({ rij }: { rij: FunctieRij }) {
  return (
    <>
      <LinkRij kop={rij.kop} links={rij.links} />
      {rij.uitleg ? <p className="mt-2 text-xs text-neutralx-500">{rij.uitleg}</p> : null}
    </>
  );
}

// ---- /werken-als/<functie> -------------------------------------------------
export function FunctieLanding({ functie: f }: { functie: Functie }) {
  const p = functiePagina(f);
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([
              ["Home", "/"],
              ["Werken als", WERKEN_ALS_PAD],
              [p.titel, p.pad],
            ]),
            faqJsonLd(p.faq),
          ]),
        }}
      />
      <Section>
        <HeroMetFoto foto={functieFoto(f)}>
          <SectionHead kop="h1" eyebrow={p.eyebrow} title={p.titel} intro={p.intro} />
          <Knoppen />
        </HeroMetFoto>
        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <Lijst kop={p.takenKop} items={p.taken} />
          <Lijst kop={p.nodigKop} items={p.nodig} />
        </div>
        <div className="mt-12 max-w-3xl">
          <h2 className="font-display text-xl font-bold text-ink">{p.tijdenKop}</h2>
          <p className="mt-3 leading-relaxed text-neutralx-600">{p.tijden}</p>
        </div>
        <div className="mt-12 max-w-3xl rounded-2xl border border-hair bg-white p-5 md:p-7">
          <h2 className="font-display text-xl font-bold text-ink">{p.tariefKop}</h2>
          {p.tarief.bedrag ? <p className="num mt-3 font-display text-3xl font-bold text-ink">{p.tarief.bedrag}</p> : null}
          <p className="mt-3 leading-relaxed text-neutralx-600">{p.tarief.tekst}</p>
          <p className="mt-3 text-sm">
            <Link href={p.tarief.bron.href} className="font-semibold text-brand-600 hover:underline">
              {p.tarief.bron.label}
            </Link>
          </p>
        </div>
        <h2 className="mt-14 font-display text-xl font-bold text-ink">{p.voorWieKop}</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {p.voorWie.map(([t, b]) => (
            <li key={t} className="rounded-2xl border border-hair bg-white p-5">
              <p className="font-display font-bold text-ink">{t}</p>
              <p className="mt-2 text-sm text-neutralx-600">{b}</p>
            </li>
          ))}
        </ul>
        <h2 className="mt-14 font-display text-xl font-bold text-ink">{p.viaKop}</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-neutralx-600">{p.via}</p>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {p.stappen.map(([t, b], i) => (
            <li key={t} className="rounded-2xl border border-hair bg-white p-5">
              <p className="font-display font-bold text-ink">
                <span className="mr-2 text-brand-600">{i + 1}.</span>
                {t}
              </p>
              <p className="mt-2 text-sm text-neutralx-600">{b}</p>
            </li>
          ))}
        </ol>
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title={p.faqKop} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={p.faq} />
        </div>
        {p.rijen.map((r) => (
          <Rij key={r.kop} rij={r} />
        ))}
      </Section>
      <CtaBand
        title={p.ctaTitel}
        body={CTA_TEKST}
        primaryHref={KNOPPEN[0].href}
        primaryLabel={KNOPPEN[0].label}
        secondaryHref={KNOPPEN[1].href}
        secondaryLabel={KNOPPEN[1].label}
      />
    </>
  );
}

// ---- /werken-als -----------------------------------------------------------
export function WerkenAlsHub() {
  const p = werkenAlsHub();
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([breadcrumbJsonLd([["Home", "/"], ["Werken als", WERKEN_ALS_PAD]]), faqJsonLd(p.faq)]),
        }}
      />
      <Section>
        <HeroMetFoto foto={sectorFoto("bijbaan", 9)}>
          <SectionHead kop="h1" eyebrow={p.eyebrow} title={p.titel} intro={p.intro} />
          <Knoppen />
        </HeroMetFoto>
        {p.groepen.map((g) => (
          <div key={g.href}>
            <h2 className="mt-14 font-display text-xl font-bold text-ink">{g.kop}</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {g.kaarten.map((k) => (
                <li key={k.href}>
                  <Link href={k.href} className="block h-full rounded-xl border border-hair bg-white px-4 py-3 text-sm hover:border-brand-500">
                    <span className="font-semibold text-ink">{k.titel}</span>
                    {k.tarief ? <span className="mt-0.5 block text-xs text-neutralx-700">{k.tarief}</span> : null}
                    <span className="block text-xs text-neutralx-500">{k.sub}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <Link href={g.href} className="font-semibold text-brand-600 hover:underline">
                {g.link}
              </Link>
            </p>
          </div>
        ))}
        <p className="mt-10 max-w-3xl text-sm text-neutralx-600">
          {p.tariefUitleg}{" "}
          <Link href={p.bron.href} className="font-semibold text-brand-600 underline">
            {p.bron.label}
          </Link>
        </p>
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Vragen over werken via ZekerFlex" />
        <div className="mt-8 max-w-3xl">
          <FaqList items={p.faq} />
        </div>
        <LinkRij kop="Meer werk" links={[{ href: "/bijbaan", label: "Bijbaan per stad" }, { href: "/freelance-werk", label: "Freelance werk per stad" }, { href: "/starten-als-uitzendkracht", label: "Starten als uitzendkracht" }]} />
      </Section>
      <CtaBand
        title="Weet je wat je wilt doen?"
        body={CTA_TEKST}
        primaryHref={KNOPPEN[0].href}
        primaryLabel={KNOPPEN[0].label}
        secondaryHref={KNOPPEN[1].href}
        secondaryLabel={KNOPPEN[1].label}
      />
    </>
  );
}
