import type { Metadata } from "next";
import { LogoFormulier } from "@/components/marketing/logo/LogoFormulier";
import { LogoMockups } from "@/components/marketing/studio/Mockups";
import { FaqList } from "@/components/marketing/primitives";
import { BEWAAR_DAGEN, BTW_TEKST, kleurHex, prijsTekst } from "@/lib/advertentie/regels";
import { leesPrijzen } from "@/lib/advertentie/store";
import { LOGO_AANTAL, SFEREN, VARIANTEN } from "@/lib/logo/regels";
import { LOGO_VOORBEELDEN } from "@/lib/logo/voorbeelden";
import { breadcrumbJsonLd, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

const DESCRIPTION = "Vul je bedrijfsnaam in, kies een kleur en een sfeer en zie meteen negen logo's. Je betaalt niets voor het voorbeeld, pas als je het wilt hebben.";

export const metadata: Metadata = {
  title: "Logo maker: maak je eigen logo",
  description: DESCRIPTION,
  alternates: { canonical: "/logo-maker" },
};

// de prijs komt uit Beheer (KV), dus niet tijdens de build vastleggen
export const dynamic = "force-dynamic";

const STAPPEN = [
  { titel: "Vul je naam in", tekst: "Je bedrijfsnaam, een kleur en een sfeer: van streetwear en sport tot luxe en klassiek. Een slogan mag erbij." },
  { titel: "Bekijk negen logo's", tekst: "Wit op zwart, zoals een merk op een shirt. Met één tik zie je ze ook op wit of in jouw kleur. Andere sfeer proberen? Maak ze opnieuw." },
  { titel: "Betaal pas als je het wilt", tekst: "Kies je logo en laat je gegevens achter. Na betaling krijg je het zonder watermerk, in vijf bestanden." },
];

const voorbeeld = (sleutel: string, thema: string) => `/api/logo-maker/voorbeeld/${sleutel}?thema=${thema}`;

export default async function LogoMakerPage() {
  const prijzen = await leesPrijzen();
  const prijs = prijsTekst(prijzen, "logo");
  const bestanden = Object.values(VARIANTEN);
  const toon = LOGO_VOORBEELDEN[0]!;
  const faq = [
    { q: "Wat kost een logo?", a: `Het voorbeeld bekijken kost niets. Wil je een logo hebben, dan betaal je ${prijs} voor dat ene logo, in alle vijf de bestanden.` },
    { q: "Moet ik een account maken of mijn e-mailadres geven?", a: "Nee. Je vult het formulier in en ziet meteen je logo's. Pas als je er een wilt hebben, vragen we je naam en e-mailadres." },
    {
      q: "Wat krijg ik na het betalen?",
      a: `Je logo als PNG in hoge resolutie, zonder watermerk: ${bestanden.map((b) => b.naam.toLowerCase()).join(", ")}. Je downloadt ze op je eigen pagina; de link krijg je per mail.`,
    },
    { q: "Krijg ik ook een vectorbestand (SVG of EPS)?", a: "Nee. Je krijgt PNG-bestanden in hoge resolutie. Die zijn geschikt voor je website, sociale media, documenten en gewoon drukwerk." },
    {
      q: "Hoe wordt het logo gemaakt?",
      a: "Uit jouw naam, met vaste ontwerpregels: lettertypes, eigen vormen zoals sterren, banen en bergtoppen, en tekens die bij je naam of je vak passen. Er komt geen ontwerper en geen AI-beeld aan te pas. Daardoor zie je het meteen en kost het weinig.",
    },
    {
      q: "Is mijn logo uniek en beschermd?",
      a: "Dat beloven we niet. Iemand met dezelfde naam en dezelfde keuzes krijgt hetzelfde logo. De tekens en lettertypes komen uit bibliotheken die iedereen vrij mag gebruiken, dus een ander kan hetzelfde teken in zijn logo hebben. Wij controleren ook niet of je naam of logo al als merk is geregistreerd. Wil je dat zeker weten, zoek het dan zelf na in het merkenregister van het BOIP (het Benelux-Bureau voor de Intellectuele Eigendom).",
    },
    { q: "Mag ik het logo overal voor gebruiken?", a: "Ja. Na betaling mag je het logo vrij gebruiken voor je bedrijf: op je website, je kleding, je bus, je facturen en je sociale media." },
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

      <section className="bg-[#0B0B0C] text-white">
        <div className="shell grid gap-10 pb-10 pt-12 md:pt-20 lg:grid-cols-[1.05fr_minmax(0,30rem)] lg:items-center lg:gap-16">
          <div className="max-w-2xl">
            <p className="eyebrow text-brand-mint">Logo maker</p>
            <h1 className="mt-4 text-balance font-display text-5xl font-bold leading-[1.02] md:text-7xl">Maak je logo.</h1>
            <p className="mt-6 text-xl font-medium leading-snug text-white md:text-2xl">Betaal niks, zie eerst het voorbeeld.</p>
            <p className="mt-3 text-lg leading-relaxed text-white/65">
              Vul je bedrijfsnaam in, kies een kleur en een sfeer, en je ziet meteen {LOGO_AANTAL} logo&apos;s. Wil je het hebben: {prijs}.
            </p>
            <ul className="mt-8 flex flex-wrap gap-2">
              {SFEREN.map((s) => (
                <li key={s.id} className="rounded-full border border-white/15 px-3.5 py-1.5 text-sm text-white/75">
                  {s.naam}
                </li>
              ))}
            </ul>
          </div>
          <div id="maken" className="scroll-mt-24">
            <LogoFormulier />
          </div>
        </div>

        <div className="shell pb-14 md:pb-20">
          <ul className="grid grid-cols-3 overflow-hidden rounded-2xl border border-white/10" style={{ background: "rgba(255,255,255,0.1)", gap: 1 }} aria-label="Voorbeelden van logo's voor verzonnen merken">
            {LOGO_VOORBEELDEN.map((v) => (
              <li key={v.sleutel} className="group relative overflow-hidden bg-[#0B0B0C]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={voorbeeld(v.sleutel, "donker")} alt={`Voorbeeld van een logo voor het verzonnen merk ${v.invoer.naam}`} width={640} height={480} loading="lazy" className="block aspect-[4/3] h-auto w-full transition duration-500 motion-reduce:transition-none motion-safe:group-hover:scale-[1.04]" />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-white/50">Voorbeelden. Deze merken zijn verzonnen, alleen om te laten zien wat je kunt verwachten.</p>
        </div>
      </section>

      <section className="border-b border-hair bg-paper" aria-labelledby="logo-mockup-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Zo ziet het eruit</p>
          <h2 id="logo-mockup-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Je logo op een kaartje, je website en een shirt
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutralx-600">Op je eigen pagina zie je deze schetsen met jouw logo erin. Hier staat het verzonnen merk {toon.invoer.naam} als voorbeeld.</p>
          <div className="mt-10">
            <LogoMockups donker={voorbeeld(toon.sleutel, "donker")} licht={voorbeeld(toon.sleutel, "licht")} kleur={voorbeeld(toon.sleutel, "kleur")} accent={kleurHex(toon.invoer.kleur)} label="Voorbeeld: een logo op een kaartje, een website en een shirt" />
          </div>
        </div>
      </section>

      <section className="bg-paper-soft" aria-labelledby="logo-stappen-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Zo werkt het</p>
          <h2 id="logo-stappen-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Eerst zien, dan beslissen
          </h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STAPPEN.map((s, i) => (
              <li key={s.titel} className="card p-6">
                <span className="num flex h-10 w-10 items-center justify-center rounded-full bg-ink font-display text-lg font-bold text-white" aria-hidden>
                  {i + 1}
                </span>
                <h3 className="mt-4 font-display text-xl font-bold text-ink">{s.titel}</h3>
                <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">{s.tekst}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-[#0B0B0C] text-white" aria-labelledby="logo-prijs-kop">
        <div className="shell grid gap-10 py-14 md:py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow text-brand-mint">Wat het kost</p>
            <h2 id="logo-prijs-kop" className="mt-3 max-w-xl text-balance font-display text-3xl font-bold leading-tight md:text-5xl">
              Het voorbeeld is gratis. Je betaalt alleen als je het wilt.
            </h2>
            <p className="mt-6">
              <span className="num font-display text-6xl font-bold">{prijzen.logo}</span> <span className="text-white/60">{BTW_TEKST}, voor één logo in vijf bestanden</span>
            </p>
            <a href="#maken" className="btn-mint mt-8 px-6 py-3 text-base">
              Maak mijn logo
            </a>
          </div>
          <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.04]">
            {bestanden.map((b) => (
              <li key={b.naam} className="px-5 py-4">
                <p className="font-semibold text-white">{b.naam}</p>
                <p className="mt-0.5 text-sm text-white/60">{b.uitleg}.</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white" aria-labelledby="logo-faq-kop">
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
