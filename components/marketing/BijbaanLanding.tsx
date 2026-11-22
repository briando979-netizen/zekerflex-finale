import Link from "next/link";
import { ldJson } from "@/lib/seo/json-ld";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { HeroMetFoto } from "@/components/marketing/HeroMetFoto";
import { LinkRij, StadBlok, StadCijfers } from "@/components/marketing/StadCijfers";
import { sectorFoto } from "@/lib/marketing/fotos";
import { breadcrumbJsonLd } from "@/lib/seo";
import type { City } from "@/lib/seo-cities";
import {
  BIJBAAN_PAD,
  BIJBAAN_STAPPEN,
  CTA_TEKST,
  JONGEREN_HINT,
  JONGEREN_LINK,
  KNOPPEN,
  bijbaanHub,
  bijbaanStad,
  type Soort,
} from "@/lib/seo-bijbaan";
import type { Vraag } from "@/lib/seo-stad";
import { FUNCTIES, WERKEN_ALS_PAD, functieLink } from "@/lib/seo-functies";

// /bijbaan en /bijbaan/<stad> (22 nov 2026): de tekst komt uit lib/seo-bijbaan.ts, de cijfers per stad uit lib/seo-stad.ts.
// Zelfde blokken en klassen als de branchepagina's (components/marketing/SectorLanding.tsx). Servercomponenten.

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

/** De soorten bijbaan als kaarten, elk naar de branchepagina (in die stad). */
function Soorten({ kop, uitleg, lijst }: { kop: string; uitleg?: string | undefined; lijst: Soort[] }) {
  return (
    <>
      <h2 className="mt-14 font-display text-xl font-bold text-ink">{kop}</h2>
      {uitleg ? <p className="mt-2 text-sm text-neutralx-600">{uitleg}</p> : null}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {lijst.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="block h-full rounded-xl border border-hair bg-white px-4 py-3 text-sm hover:border-brand-500">
              <span className="font-semibold text-ink">{s.titel}</span>
              {s.cijfer ? <span className="mt-0.5 block text-xs text-neutralx-700">{s.cijfer}</span> : null}
              <span className="block text-xs text-neutralx-500">{s.tekst}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Stappen() {
  return (
    <>
      <h2 className="mt-14 font-display text-xl font-bold text-ink">Zo begin je</h2>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {BIJBAAN_STAPPEN.map(([t, b], i) => (
          <li key={t} className="rounded-2xl border border-hair bg-white p-5">
            <p className="font-display font-bold text-ink">
              <span className="mr-2 text-brand-600">{i + 1}.</span>
              {t}
            </p>
            <p className="mt-2 text-sm text-neutralx-600">{b}</p>
          </li>
        ))}
      </ol>
    </>
  );
}

// ---- /bijbaan --------------------------------------------------------------
export function BijbaanHub() {
  const p = bijbaanHub();
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([breadcrumbJsonLd([["Home", "/"], ["Bijbaan", BIJBAAN_PAD]]), faqJsonLd(p.faq)]),
        }}
      />
      <Section>
        <HeroMetFoto foto={sectorFoto("bijbaan", 0)}>
          <SectionHead kop="h1" eyebrow={p.eyebrow} title={p.titel} intro={p.intro} />
          <Knoppen />
        </HeroMetFoto>
        <Soorten kop="Wat voor bijbaan kan het zijn?" lijst={p.soorten} />
        {/* 22 nov 2026: per functie de taken, de tijden en het richttarief (lib/seo-functies.ts) */}
        <LinkRij kop="Bijbaan per functie" links={[...FUNCTIES.map(functieLink), { href: WERKEN_ALS_PAD, label: "Alle functies" }]} />
        <Stappen />
        <div className="mt-12 max-w-3xl">
          <h2 className="font-display text-xl font-bold text-ink">Vanaf 18 jaar</h2>
          <p className="mt-3 leading-relaxed text-neutralx-600">
            Werken via ZekerFlex kan vanaf 18 jaar. Ben je 16 of 17? Laat dan je e-mailadres achter, dan sturen we je een bericht zodra je via ZekerFlex aan de slag kunt.{" "}
            <Link href={JONGEREN_LINK.href} className="font-semibold text-brand-600 hover:underline">
              Naar de pagina voor 16 en 17 jaar
            </Link>
          </p>
        </div>
        <h2 className="mt-14 font-display text-xl font-bold text-ink">Bijbaan per stad</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {p.steden.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="block rounded-xl border border-hair bg-white px-4 py-3 text-sm hover:border-brand-500">
                <span className="font-semibold text-ink">{s.label}</span>
                <span className="block text-xs text-neutralx-500">{s.sub}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-neutralx-500">{p.bron}</p>
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Vragen over een bijbaan via ZekerFlex" />
        <div className="mt-8 max-w-3xl">
          <FaqList items={p.faq} />
        </div>
      </Section>
      <CtaBand
        title="Klaar voor je bijbaan?"
        body={CTA_TEKST}
        primaryHref={KNOPPEN[0].href}
        primaryLabel={KNOPPEN[0].label}
        secondaryHref={KNOPPEN[1].href}
        secondaryLabel={KNOPPEN[1].label}
      />
    </>
  );
}

// ---- /bijbaan/<stad> -------------------------------------------------------
export function BijbaanStad({ city: c }: { city: City }) {
  const p = bijbaanStad(c);
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([
              ["Home", "/"],
              ["Bijbaan", BIJBAAN_PAD],
              [`Bijbaan in ${c.name}`, `${BIJBAAN_PAD}/${c.slug}`],
            ]),
            faqJsonLd(p.faq),
          ]),
        }}
      />
      <Section>
        <HeroMetFoto foto={sectorFoto("bijbaan", c.slug)}>
          <SectionHead kop="h1" eyebrow={p.eyebrow} title={p.titel} intro={p.intro} />
          <Knoppen />
        </HeroMetFoto>
        {p.cijfers ? <StadCijfers blok={p.cijfers} /> : null}
        <StadBlok kop={p.stad.kop} tekst={p.stad.tekst} />
        <Soorten kop={p.soortenKop} uitleg={p.soortenUitleg} lijst={p.soorten} />
        <Stappen />
      </Section>
      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title={p.faqKop} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={p.faq} />
        </div>
        {p.rijen.map((r) => (
          <LinkRij key={r.kop} kop={r.kop} links={r.links} />
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
