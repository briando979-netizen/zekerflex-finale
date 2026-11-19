import type { Metadata } from "next";
import { AdvertentieFormulier } from "@/components/marketing/advertentie/AdvertentieFormulier";
import { AdMockups } from "@/components/marketing/studio/Mockups";
import { FaqList } from "@/components/marketing/primitives";
import { BEWAAR_DAGEN, BTW_TEKST, FORMATEN, PAKKETTEN, PAKKET_NAAM, PAKKET_UITLEG, prijsTekst, vanafTekst } from "@/lib/advertentie/regels";
import { leesPrijzen } from "@/lib/advertentie/store";
import { VOORBEELDEN } from "@/lib/advertentie/voorbeelden";
import { breadcrumbJsonLd, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

const DESCRIPTION = "Vul een paar dingen in over je bedrijf en zie meteen je eigen advertentie in zes ontwerpen. Je betaalt niets voor het voorbeeld, pas als je hem wilt hebben.";

export const metadata: Metadata = {
  title: "Advertentie op maat laten maken",
  description: DESCRIPTION,
  alternates: { canonical: "/advertentie-op-maat" },
};

// de prijs komt uit Beheer (KV), dus niet tijdens de build vastleggen
export const dynamic = "force-dynamic";

const STAPPEN = [
  { titel: "Vul in wat je aanbiedt", tekst: "Je bedrijfsnaam, wat je doet en een kleur. Een actie of boodschap mag erbij. Meer hebben we niet nodig." },
  { titel: "Bekijk je voorbeeld", tekst: "Je ziet direct zes ontwerpen van je eigen advertentie. Niet goed? Maak hem gewoon opnieuw." },
  { titel: "Betaal pas als je hem wilt", tekst: "Kies je ontwerp en laat je gegevens achter. Na betaling krijg je hem zonder watermerk, in drie formaten." },
];

const maten = Object.values(FORMATEN).map((f) => `${f.naam.toLowerCase()} (${f.maat})`);

export default async function AdvertentieOpMaatPage() {
  const prijzen = await leesPrijzen();
  const faq = [
    {
      q: "Wat kost een advertentie op maat?",
      a: `Het voorbeeld bekijken kost niets. Wil je hem hebben, dan betaal je ${prijsTekst(prijzen, "een")} voor één ontwerp of ${prijsTekst(prijzen, "alle")} voor alle zes de ontwerpen. Elk ontwerp krijg je in drie formaten.`,
    },
    {
      q: "Moet ik een account maken of mijn e-mailadres geven?",
      a: "Nee. Je vult het formulier in en ziet meteen je voorbeeld. Pas als je de advertentie wilt hebben, vragen we je naam en e-mailadres.",
    },
    {
      q: "Wat krijg ik na het betalen?",
      a: `Je advertentie als afbeelding (PNG) zonder watermerk, in drie formaten: ${maten.join(", ")}. Je downloadt ze op je eigen pagina; de link krijg je per mail.`,
    },
    {
      q: "Hoe betaal ik?",
      a: "Je kiest je ontwerp en laat je gegevens achter. Wij nemen contact met je op en sturen een betaalverzoek. Na je betaling zetten wij de bestanden voor je klaar.",
    },
    {
      q: "Plaatsen jullie de advertentie ook voor mij?",
      a: "Nee. Je krijgt de bestanden en plaatst ze zelf, bijvoorbeeld op je sociale media, je website of in een nieuwsbrief.",
    },
    {
      q: "Wie schrijft de tekst?",
      a: "Een taalmodel (AI) maakt van wat jij invult een kop, een korte zin en een knoptekst. Het gebruikt alleen jouw eigen informatie en bedenkt geen kortingen of cijfers. Lees de tekst wel zelf na: jij weet of hij klopt.",
    },
    {
      q: "Waarom staat er een watermerk op het voorbeeld?",
      a: "Zo kun je het ontwerp rustig beoordelen zonder dat je eerst iets betaalt. De versie zonder watermerk en in volle grootte maken we pas na je betaling.",
    },
    {
      q: "Hoe lang blijft mijn advertentie bewaard?",
      a: `${BEWAAR_DAGEN} dagen. Daarna wissen we hem, met de gegevens die je erbij invulde. Download je bestanden dus op tijd.`,
    },
  ];

  const bedrag = /^€ ?(\d+(?:,\d{2})?)$/.exec(prijzen.een)?.[1]?.replace(",", ".");
  const dienst = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Advertentie op maat",
    description: DESCRIPTION,
    serviceType: "Advertentieontwerp",
    areaServed: "NL",
    provider: { "@type": "Organization", name: SITE.name, url: SITE.url },
    url: `${SITE.url}/advertentie-op-maat`,
    ...(bedrag ? { offers: { "@type": "Offer", price: bedrag, priceCurrency: "EUR" } } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson([dienst, breadcrumbJsonLd([["Home", "/"], ["Aanbod", "/aanbod"], ["Advertentie op maat", "/advertentie-op-maat"]])]) }}
      />

      <section className="bg-[#0B0B0C] text-white">
        <div className="shell grid gap-10 py-12 md:py-20 lg:grid-cols-[1.05fr_minmax(0,30rem)] lg:items-center lg:gap-16">
          <div className="max-w-2xl">
            <p className="eyebrow text-brand-mint">Advertentie op maat</p>
            <h1 className="mt-4 text-balance font-display text-5xl font-bold leading-[1.02] md:text-7xl">Jouw advertentie op maat gemaakt.</h1>
            <p className="mt-6 text-xl font-medium leading-snug text-white md:text-2xl">Betaal niks, zie eerst het voorbeeld.</p>
            <p className="mt-3 text-lg leading-relaxed text-white/70">
              Vul een paar dingen in over je bedrijf en je ziet meteen je eigen advertentie, in zes ontwerpen. Wil je hem hebben: {vanafTekst(prijzen).toLowerCase()} {BTW_TEKST}.
            </p>
            <ul className="mt-8 space-y-2.5 text-base text-white/80">
              {["Geen account en geen e-mailadres nodig", "Zes ontwerpen in jouw kleur", "Klaar voor sociale media, je website en je nieuwsbrief"].map((x) => (
                <li key={x} className="flex items-start gap-3">
                  <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-brand-mint" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div id="maken" className="scroll-mt-24">
            <AdvertentieFormulier />
          </div>
        </div>
      </section>

      <section className="bg-paper" aria-labelledby="adv-stappen-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Zo werkt het</p>
          <h2 id="adv-stappen-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Eerst zien, dan beslissen
          </h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STAPPEN.map((s, i) => (
              <li key={s.titel} className="card p-6">
                <span className="num flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 font-display text-lg font-bold text-white" aria-hidden>
                  {i + 1}
                </span>
                <h3 className="mt-4 font-display text-xl font-bold text-ink">{s.titel}</h3>
                <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">{s.tekst}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-hair bg-paper-soft" aria-labelledby="adv-voorbeelden-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Voorbeelden</p>
          <h2 id="adv-voorbeelden-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Zo kan die van jou eruitzien
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutralx-600">Zes ontwerpen, van strak en rustig tot een donkere poster met een schuine kop. Deze bedrijven zijn verzonnen, alleen om het te laten zien.</p>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {VOORBEELDEN.map((v) => (
              <li key={v.sleutel} className="relative overflow-hidden rounded-3xl border border-hair bg-white shadow-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/advertentie/voorbeeld/${v.sleutel}`} alt={`Voorbeeld van een advertentie voor ${v.soort}: ${v.gegevens.kop}`} width={600} height={600} loading="lazy" className="block aspect-square h-auto w-full" />
                <p className="border-t border-hair px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-neutralx-500">Voorbeeld, verzonnen bedrijf</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-hair bg-paper" aria-labelledby="adv-mockup-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Zo ziet het eruit</p>
          <h2 id="adv-mockup-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Op een telefoon, als verhaal en liggend
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutralx-600">Je krijgt elk ontwerp in drie formaten. Op je eigen pagina zie je deze schetsen met jouw advertentie erin; hier staat een verzonnen sportschool als voorbeeld.</p>
          <div className="mt-10">
            <AdMockups vierkant="/api/advertentie/voorbeeld/sportschool" verhaal="/api/advertentie/voorbeeld/sportschool?formaat=verhaal" liggend="/api/advertentie/voorbeeld/sportschool?formaat=liggend" naam="Sportschool Noord" label="Voorbeeld: een advertentie op een telefoon, als verhaal en liggend" />
          </div>
        </div>
      </section>

      <section className="border-t border-hair bg-paper-soft" aria-labelledby="adv-prijs-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Wat het kost</p>
          <h2 id="adv-prijs-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Het voorbeeld is gratis. Je betaalt alleen als je hem wilt.
          </h2>
          <div className="mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
            {PAKKETTEN.map((p) => (
              <div key={p} className="card flex flex-col p-6 md:p-7">
                <h3 className="font-display text-xl font-bold text-ink">{PAKKET_NAAM[p]}</h3>
                <p className="mt-3">
                  <span className="num font-display text-4xl font-bold text-ink">{prijzen[p]}</span> <span className="text-sm text-neutralx-500">{BTW_TEKST}</span>
                </p>
                <p className="mt-3 text-[0.975rem] leading-relaxed text-neutralx-600">{PAKKET_UITLEG[p]}</p>
                <ul className="mt-4 space-y-1.5 text-sm text-neutralx-600">
                  {Object.values(FORMATEN).map((f) => (
                    <li key={f.naam} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
                      {f.naam}, {f.maat}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <a href="#maken" className="btn-primary mt-8 px-6 py-3 text-base">
            Maak mijn advertentie
          </a>
        </div>
      </section>

      <section className="border-t border-hair bg-white" aria-labelledby="adv-faq-kop">
        <div className="shell py-14 md:py-20">
          <h2 id="adv-faq-kop" className="font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Veelgestelde vragen
          </h2>
          <div className="mt-8 max-w-3xl">
            <FaqList items={faq} />
          </div>
        </div>
      </section>
    </>
  );
}
