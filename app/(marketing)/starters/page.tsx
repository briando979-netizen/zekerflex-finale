import type { Metadata } from "next";
import Link from "next/link";
import { StartersFormulier } from "@/components/marketing/starters/StartersFormulier";
import { FaqList } from "@/components/marketing/primitives";
import { BTW_TEKST, prijsTekst as advertentiePrijs, vanafTekst } from "@/lib/advertentie/regels";
import { leesPrijzen } from "@/lib/advertentie/store";
import { AANBOD, aanbodHref, prijsTekst } from "@/lib/marketing/aanbod";
import { STARTERS_ONDERDELEN } from "@/lib/starters/regels";
import { breadcrumbJsonLd, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

const DESCRIPTION = "Wij helpen starters van aanvraag tot product: logo, domeinnaam, website, webshop en advertentie. Je ziet eerst het voorbeeld en betaalt alleen voor resultaat.";

export const metadata: Metadata = {
  title: "Voor starters: van idee tot merk",
  description: DESCRIPTION,
  alternates: { canonical: "/starters" },
};

// de prijzen van het logo en de advertentie komen uit Beheer (KV), dus niet tijdens de build vastleggen
export const dynamic = "force-dynamic";

const ROUTE = [
  { titel: "Vertel wat je wilt", tekst: "Je bedrijfsnaam of je idee, en wat je nodig hebt. Meer niet." },
  { titel: "Je ziet een voorbeeld", tekst: "Je logo en je advertentie zie je meteen. Voor een website klik je eerst rond in complete voorbeelden." },
  { titel: "Jij beslist", tekst: "Bevalt het? Dan kies je wat je wilt hebben. Bevalt het niet, dan kost het je niets." },
  { titel: "Pas dan betaal je", tekst: "Alleen voor wat je afneemt. De prijs weet je vooraf." },
  { titel: "Je staat live", tekst: "Met een eigen naam, een eigen gezicht en een plek waar klanten je vinden." },
];

const GRATIS = [
  { naam: "Zzp-uurtarief berekenen", tekst: "Wat moet je per uur vragen om er goed van te leven?", href: "/rekentools/zzp-uurtarief-berekenen" },
  { naam: "Btw-nummer en KVK-check", tekst: "Controleer het btw-nummer van een klant of leverancier.", href: "/rekentools/btw-nummer-check" },
  { naam: "Wet DBA-check", tekst: "Werk je als zzp'er voor een opdrachtgever? Loop de punten na.", href: "/rekentools/wet-dba-check" },
];

export default async function StartersPage() {
  const prijzen = await leesPrijzen();
  // alleen wat nu echt bestaat: een onderdeel zonder beschikbaar item in het aanbod valt weg
  const onderdelen = STARTERS_ONDERDELEN.flatMap((o) => {
    const item = AANBOD.find((a) => a.slug === o.slug && a.status === "beschikbaar");
    if (!item) return [];
    const prijs = o.slug === "logo-maker" ? advertentiePrijs(prijzen, "logo") : o.slug === "advertentie-op-maat" ? `${vanafTekst(prijzen)} ${BTW_TEKST}` : prijsTekst(item);
    return [{ ...o, prijs, href: o.href ?? aanbodHref(item), meer: aanbodHref(item) }];
  });
  const heeft = (slug: string) => onderdelen.some((o) => o.slug === slug);
  const rekentools = AANBOD.some((a) => a.slug === "rekentools" && a.status === "beschikbaar");

  const faq = [
    {
      q: "Wat betekent 'alleen betalen voor resultaat' precies?",
      a: "Dat je eerst ziet wat je krijgt en pas daarna beslist. Je logo en je advertentie maak je zelf en bekijk je gratis; je betaalt pas als je ze wilt hebben. Of je domeinnaam vrij is, zoek je gratis op; je betaalt pas als je hem aanvraagt. Voor een website of webshop bekijk je eerst complete voorbeelden.",
    },
    {
      q: "En wat betekent het niet?",
      a: "Het is geen belofte dat je bedrijf klanten of omzet krijgt; dat kan niemand eerlijk beloven. Het is ook geen 'niet goed, geld terug' achteraf. Je beslist vóór je betaalt, met het voorbeeld voor je neus.",
    },
    {
      q: "Wat kost het?",
      a: `Dat hangt af van wat je neemt. ${heeft("logo-maker") ? `Een logo kost ${advertentiePrijs(prijzen, "logo")}. ` : ""}${heeft("advertentie-op-maat") ? `Een advertentie kost ${advertentiePrijs(prijzen, "een")} voor één ontwerp of ${advertentiePrijs(prijzen, "alle")} voor alle drie. ` : ""}Bij elk onderdeel op deze pagina staat de prijs erbij. Er is geen pakket dat je in één keer moet afnemen.`,
    },
    {
      q: "Moet ik alles tegelijk doen?",
      a: "Nee. Begin met wat je nu nodig hebt, bijvoorbeeld alleen een logo of een domeinnaam. De rest kan later.",
    },
    {
      q: "Regelen jullie ook mijn inschrijving, boekhouding of verzekering?",
      a: "Nee. Wij helpen met hoe je bedrijf eruitziet en gevonden wordt. Je inschrijving bij de Kamer van Koophandel, je boekhouding en je verzekeringen regel je zelf.",
    },
    {
      q: "Wat gebeurt er als ik het formulier instuur?",
      a: "Je aanvraag komt bij ons binnen en wij nemen contact met je op om te horen wat je wilt. Je zit nergens aan vast.",
    },
  ];

  const pagina = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Hulp voor starters: van idee tot merk",
    description: DESCRIPTION,
    areaServed: "NL",
    provider: { "@type": "Organization", name: SITE.name, url: SITE.url },
    url: `${SITE.url}/starters`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson([pagina, breadcrumbJsonLd([["Home", "/"], ["Aanbod", "/aanbod"], ["Voor starters", "/starters"]])]) }} />

      <section className="hero-ink text-white">
        <div className="shell py-14 md:py-24">
          <div className="max-w-3xl">
            <p className="eyebrow text-brand-mint">Voor starters</p>
            <h1 className="mt-4 text-balance font-display text-5xl font-bold leading-[1.03] md:text-7xl">Van idee tot merk.</h1>
            <p className="mt-6 text-xl font-medium leading-snug text-white md:text-2xl">Wij helpen starters van aanvraag tot product. Je betaalt alleen voor resultaat.</p>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/70">Een naam, een logo, een website en je eerste advertentie. Je ziet eerst wat je krijgt. Pas als het goed is, betaal je.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#aanvraag" className="btn-mint px-6 py-3 text-base">
                Vertel wat je wilt starten
              </a>
              <a href="#onderdelen" className="btn-ghost-invert px-6 py-3 text-base">
                Bekijk wat er kan
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-paper" aria-labelledby="st-route-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Van aanvraag tot product</p>
          <h2 id="st-route-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Eerst zien. Dan pas betalen.
          </h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {ROUTE.map((s, i) => (
              <li key={s.titel} className="card p-5">
                <span className="num flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 font-display text-base font-bold text-white" aria-hidden>
                  {i + 1}
                </span>
                <h3 className="mt-4 font-display text-lg font-bold text-ink">{s.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{s.tekst}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="onderdelen" className="scroll-mt-24 border-t border-hair bg-paper-soft" aria-labelledby="st-onderdelen-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Wat we voor je doen</p>
          <h2 id="st-onderdelen-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Alles voor je eerste indruk
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutralx-600">Neem wat je nodig hebt. Bij elk onderdeel staat wat je eerst gratis ziet en wanneer je pas betaalt.</p>
          <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {onderdelen.map((o) => (
              <li key={o.slug} className="card flex flex-col p-6">
                <h3 className="font-display text-xl font-bold text-ink">{o.naam}</h3>
                <p className="mt-1 text-sm font-semibold text-brand-700">{o.prijs}</p>
                <dl className="mt-4 space-y-3 text-[0.95rem] leading-relaxed">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Eerst zie je</dt>
                    <dd className="mt-0.5 text-neutralx-600">{o.eerst}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Je betaalt</dt>
                    <dd className="mt-0.5 text-neutralx-600">{o.betaal}</dd>
                  </div>
                </dl>
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5">
                  <Link href={o.href} className="btn-primary px-4 py-2 text-sm">
                    {o.knop}
                  </Link>
                  {o.meer !== o.href && (
                    <Link href={o.meer} className="text-sm font-semibold text-brand-700 underline underline-offset-2">
                      Meer uitleg
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {rekentools && (
            <div className="mt-12">
              <h3 className="font-display text-xl font-bold text-ink">Gratis om mee te rekenen</h3>
              <p className="mt-1 text-neutralx-600">Zonder account en zonder kosten.</p>
              <ul className="mt-5 grid gap-4 md:grid-cols-3">
                {GRATIS.map((g) => (
                  <li key={g.href}>
                    <Link href={g.href} className="block h-full rounded-2xl border border-hair bg-white p-5 transition hover:border-brand-300">
                      <span className="block font-semibold text-ink">{g.naam}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-neutralx-600">{g.tekst}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section id="aanvraag" className="scroll-mt-24 border-t border-hair bg-paper" aria-labelledby="st-aanvraag-kop">
        <div className="shell grid gap-10 py-14 md:py-20 lg:grid-cols-[1fr_minmax(0,34rem)] lg:gap-16">
          <div className="max-w-xl">
            <p className="eyebrow">Hulp nodig?</p>
            <h2 id="st-aanvraag-kop" className="mt-3 text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
              Vertel wat je wilt starten
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-neutralx-600">Weet je nog niet precies wat je nodig hebt, of wil je dat we met je meekijken? Laat het weten. Wij nemen contact met je op.</p>
            <ul className="mt-6 space-y-2.5 text-neutralx-600">
              {["Je zit nergens aan vast", "Je betaalt niets voordat je zelf ja zegt", "Je kunt ook gewoon zelf beginnen met de knoppen hierboven"].map((x) => (
                <li key={x} className="flex items-start gap-3">
                  <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-brand-500" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <StartersFormulier keuzes={onderdelen.map((o) => ({ slug: o.slug, naam: o.naam }))} />
        </div>
      </section>

      <section className="border-t border-hair bg-white" aria-labelledby="st-faq-kop">
        <div className="shell py-14 md:py-20">
          <h2 id="st-faq-kop" className="font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Eerlijk over wat je krijgt
          </h2>
          <div className="mt-8 max-w-3xl">
            <FaqList items={faq} />
          </div>
        </div>
      </section>
    </>
  );
}
