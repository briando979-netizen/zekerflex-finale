import type { Metadata } from "next";
import { LogoFormulier } from "@/components/marketing/logo/LogoFormulier";
import { FaqList } from "@/components/marketing/primitives";
import { BEWAAR_DAGEN, BTW_TEKST, prijsTekst } from "@/lib/advertentie/regels";
import { leesPrijzen } from "@/lib/advertentie/store";
import { LOGOS, VARIANTEN } from "@/lib/logo/regels";
import { LOGO_VOORBEELDEN } from "@/lib/logo/voorbeelden";
import { breadcrumbJsonLd, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

const DESCRIPTION = "Vul je bedrijfsnaam in, kies een kleur en een sfeer en zie meteen zes logo's. Je betaalt niets voor het voorbeeld, pas als je het wilt hebben.";

export const metadata: Metadata = {
  title: "Logo maker: maak je eigen logo",
  description: DESCRIPTION,
  alternates: { canonical: "/logo-maker" },
};

// de prijs komt uit Beheer (KV), dus niet tijdens de build vastleggen
export const dynamic = "force-dynamic";

const STAPPEN = [
  { titel: "Vul je naam in", tekst: "Je bedrijfsnaam, een kleur en een sfeer: strak, speels, klassiek of stoer. Een slogan mag erbij." },
  { titel: "Bekijk zes logo's", tekst: "Van woordmerk tot zegel, allemaal met jouw naam. Andere kleur of sfeer proberen? Maak ze gewoon opnieuw." },
  { titel: "Betaal pas als je het wilt", tekst: "Kies je logo en laat je gegevens achter. Na betaling krijg je het zonder watermerk, in vijf bestanden." },
];

export default async function LogoMakerPage() {
  const prijzen = await leesPrijzen();
  const prijs = prijsTekst(prijzen, "logo");
  const bestanden = Object.values(VARIANTEN);
  const faq = [
    { q: "Wat kost een logo?", a: `Het voorbeeld bekijken kost niets. Wil je een logo hebben, dan betaal je ${prijs} voor dat ene logo, in alle vijf de bestanden.` },
    { q: "Moet ik een account maken of mijn e-mailadres geven?", a: "Nee. Je vult het formulier in en ziet meteen je logo's. Pas als je er een wilt hebben, vragen we je naam en e-mailadres." },
    {
      q: "Wat krijg ik na het betalen?",
      a: `Je logo als PNG in hoge resolutie, zonder watermerk: ${bestanden.map((b) => b.naam.toLowerCase()).join(", ")}. Je downloadt ze op je eigen pagina; de link krijg je per mail.`,
    },
    { q: "Krijg ik ook een vectorbestand (SVG of EPS)?", a: "Nee. Je krijgt PNG-bestanden in hoge resolutie. Die zijn geschikt voor je website, sociale media, documenten en gewoon drukwerk." },
    { q: "Hoe wordt het logo gemaakt?", a: "Uit jouw naam, met vaste ontwerpregels: lettertypes, kleur en eenvoudige vormen. Er komt geen ontwerper en geen AI-beeld aan te pas. Daardoor zie je het meteen en kost het weinig." },
    {
      q: "Is mijn logo uniek en beschermd?",
      a: "Dat beloven we niet. Iemand met dezelfde naam en dezelfde keuzes krijgt hetzelfde logo. Wij controleren ook niet of je naam of logo al als merk is geregistreerd. Wil je dat zeker weten, zoek het dan zelf na in het merkenregister van het BOIP (het Benelux-Bureau voor de Intellectuele Eigendom).",
    },
    { q: "Mag ik het logo overal voor gebruiken?", a: "Ja. Na betaling mag je het logo vrij gebruiken voor je bedrijf: op je website, je bus, je facturen en je sociale media." },
    { q: "Hoe betaal ik?", a: "Je kiest je logo en laat je gegevens achter. Wij nemen contact met je op en sturen een betaalverzoek. Na je betaling zetten wij de bestanden voor je klaar." },
    { q: "Hoe lang blijven mijn logo's bewaard?", a: `${BEWAAR_DAGEN} dagen. Daarna wissen we ze, met de gegevens die je erbij invulde. Download je bestanden dus op tijd.` },
  ];

  const bedrag = /^€ ?(\d+(?:,\d{2})?)$/.exec(prijzen.logo)?.[1]?.replace(",", ".");
  const dienst = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Logo maker",
    description: DESCRIPTION,
    serviceType: "Logo-ontwerp",
    areaServed: "NL",
    provider: { "@type": "Organization", name: SITE.name, url: SITE.url },
    url: `${SITE.url}/logo-maker`,
    ...(bedrag ? { offers: { "@type": "Offer", price: bedrag, priceCurrency: "EUR" } } : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson([dienst, breadcrumbJsonLd([["Home", "/"], ["Aanbod", "/aanbod"], ["Logo maker", "/logo-maker"]])]) }} />

      <section className="hero-ink text-white">
        <div className="shell grid gap-10 py-12 md:py-20 lg:grid-cols-[1.05fr_minmax(0,30rem)] lg:items-center lg:gap-16">
          <div className="max-w-2xl">
            <p className="eyebrow text-brand-mint">Logo maker</p>
            <h1 className="mt-4 text-balance font-display text-4xl font-bold leading-[1.06] md:text-[3.4rem]">Maak je logo.</h1>
            <p className="mt-6 text-xl font-medium leading-snug text-white md:text-2xl">Betaal niks, zie eerst het voorbeeld.</p>
            <p className="mt-3 text-lg leading-relaxed text-white/70">
              Vul je bedrijfsnaam in, kies een kleur en een sfeer, en je ziet meteen zes logo&apos;s. Wil je het hebben: {prijs}.
            </p>
            <ul className="mt-8 space-y-2.5 text-base text-white/80">
              {["Geen account en geen e-mailadres nodig", "Zes logo's met jouw naam, in jouw kleur", "Ook in wit, in zwart en als vierkant icoon"].map((x) => (
                <li key={x} className="flex items-start gap-3">
                  <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-brand-mint" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div id="maken" className="scroll-mt-24">
            <LogoFormulier />
          </div>
        </div>
      </section>

      <section className="bg-paper" aria-labelledby="logo-stappen-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Zo werkt het</p>
          <h2 id="logo-stappen-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
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

      <section className="border-t border-hair bg-paper-soft" aria-labelledby="logo-voorbeelden-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Voorbeelden</p>
          <h2 id="logo-voorbeelden-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Zes soorten logo, vier sferen
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutralx-600">Deze bedrijven zijn verzonnen, alleen om te laten zien wat je kunt verwachten.</p>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {LOGO_VOORBEELDEN.map((v) => (
              <li key={v.sleutel} className="relative overflow-hidden rounded-3xl border border-hair bg-white shadow-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/logo-maker/voorbeeld/${v.sleutel}`} alt={`Voorbeeld van een logo voor ${v.invoer.naam} (${LOGOS.find((l) => l.nr === v.logo)?.naam.toLowerCase()})`} width={720} height={540} loading="lazy" className="block aspect-[4/3] h-auto w-full" />
                <p className="border-t border-hair px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-neutralx-500">Voorbeeld, verzonnen bedrijf</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-hair bg-paper" aria-labelledby="logo-prijs-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Wat het kost</p>
          <h2 id="logo-prijs-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Het voorbeeld is gratis. Je betaalt alleen als je het wilt.
          </h2>
          <div className="card mt-10 max-w-2xl p-6 md:p-7">
            <h3 className="font-display text-xl font-bold text-ink">Eén logo, vijf bestanden</h3>
            <p className="mt-3">
              <span className="num font-display text-4xl font-bold text-ink">{prijzen.logo}</span> <span className="text-sm text-neutralx-500">{BTW_TEKST}</span>
            </p>
            <ul className="mt-4 space-y-2 text-[0.975rem] text-neutralx-600">
              {bestanden.map((b) => (
                <li key={b.naam} className="flex items-start gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500" aria-hidden />
                  <span>
                    <strong className="font-semibold text-ink">{b.naam}.</strong> {b.uitleg}.
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <a href="#maken" className="btn-primary mt-8 px-6 py-3 text-base">
            Maak mijn logo
          </a>
        </div>
      </section>

      <section className="border-t border-hair bg-white" aria-labelledby="logo-faq-kop">
        <div className="shell py-14 md:py-20">
          <h2 id="logo-faq-kop" className="font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
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
