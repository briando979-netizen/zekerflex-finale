import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, FaqList } from "@/components/marketing/primitives";
import { DomeinZoeker } from "@/components/domeinen/DomeinZoeker";
import { EXTENSIES, euroPrijs } from "@/lib/domeinen/extensies";
import {
  BUNDEL_TEKST,
  DOMEIN_FAQ,
  DOMEIN_STAPPEN,
  DOMEIN_VOORDELEN,
  VERHUIS_STAPPEN,
  domeinFaqJsonLd,
  goedkoopsteEersteJaar,
  prijsKaarten,
  type Voordeel,
} from "@/lib/domeinen/pagina-teksten";
import { breadcrumbJsonLd, canonical, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { seoBeschrijving, seoTitel } from "@/lib/seo-tekst";

const TITLE = "Domeinnaam registreren of verhuizen";
const DESCRIPTION =
  "Zoek direct of je domeinnaam nog vrij is: .nl, .com, .eu, .be en meer, voor een eerlijke prijs per jaar. Of verhuis je bestaande domein naar ZekerFlex, los of samen met je website of webshop.";

export const metadata: Metadata = {
  title: { absolute: seoTitel(TITLE) },
  description: seoBeschrijving(DESCRIPTION),
  keywords: ["domeinnaam registreren", "domeinnaam kopen", "domein verhuizen", "nl domein", "domeinnaam checken", "domeinnaam beschikbaar"],
  ...canonical("/domeinnaam", { title: TITLE, description: DESCRIPTION }),
};

const goedkoopste = goedkoopsteEersteJaar();
const kaarten = prijsKaarten();

function Vinkje() {
  return (
    <span aria-hidden className="text-brand-500">
      ✓
    </span>
  );
}

/** Kleine lijnicoontjes voor de voordelen (eigen tekening, geen bibliotheek). */
function VoordeelIcoon({ soort }: { soort: Voordeel["icoon"] }) {
  const pad: Record<Voordeel["icoon"], string> = {
    prijs: "M7 7h10M7 12h10M7 17h6M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
    koppelen: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
    "een-plek": "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    vrij: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4",
  };
  return (
    <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-mintwash text-brand-700">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d={pad[soort]} />
      </svg>
    </span>
  );
}

// Domeinnaam zoeken, registreren of verhuizen (lib/domeinen). Opbouw zoals de grote domeinwinkels, met onze eigen
// inhoud (lib/domeinen/pagina-teksten.ts). Aanvragen landen in de sales-pijplijn; een mens neemt contact op.
export default function DomeinnaamPagina() {
  const dienst = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Domeinnaam registreren en verhuizen",
    description: DESCRIPTION,
    provider: { "@type": "Organization", name: SITE.name, url: SITE.url },
    areaServed: { "@type": "Country", name: "Nederland" },
    url: `${SITE.url}/domeinnaam`,
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson([dienst, domeinFaqJsonLd(), breadcrumbJsonLd([["Home", "/"], ["Aanbod", "/aanbod"], ["Domeinnaam", "/domeinnaam"]])]),
        }}
      />

      {/* de kop: de zoekbalk staat centraal */}
      <div className="hero-ink text-white">
        <div className="shell pb-14 pt-14 md:pb-20 md:pt-20">
          <p className="eyebrow text-center text-brand-mint">
            <Link href="/aanbod#online" className="hover:underline">
              Online &amp; klanten
            </Link>{" "}
            · Domeinnaam
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-balance text-center font-display text-4xl font-bold md:text-6xl">Registreer je eigen domeinnaam</h1>
          <p className="mx-auto mt-5 max-w-2xl text-center text-lg text-white/70">
            Zoek direct of je naam nog vrij is.
            {goedkoopste && (
              <>
                {" "}
                Een .{goedkoopste.tld} heb je het eerste jaar al vanaf <strong className="text-white">{euroPrijs(goedkoopste.prijsCent)}</strong> (excl. btw).
              </>
            )}
          </p>
          <div id="zoek" className="mx-auto mt-10 max-w-3xl scroll-mt-24 rounded-3xl bg-white p-5 text-ink shadow-2xl md:p-7">
            <h2 className="font-display text-lg font-bold text-ink md:text-xl">Is jouw naam nog vrij?</h2>
            <div className="mt-4">
              <DomeinZoeker />
            </div>
          </div>
          <ul className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/80">
            <li className="flex gap-2">
              <Vinkje />
              Direct zien of je naam vrij is
            </li>
            <li className="flex gap-2">
              <Vinkje />
              Eerste jaar en daarna: de prijs vooraf
            </li>
            <li className="flex gap-2">
              <Vinkje />
              Een .nl verhuizen is gratis
            </li>
            <li className="flex gap-2">
              <Vinkje />
              Binnen één werkdag persoonlijk contact
            </li>
          </ul>
        </div>
      </div>

      {/* in drie stappen */}
      <section className="bg-paper" aria-labelledby="stappen-titel">
        <div className="shell py-16 md:py-20">
          <h2 id="stappen-titel" className="text-center font-display text-3xl font-bold text-ink md:text-4xl">
            In 3 stappen je <span className="text-brand-600">domeinnaam</span>
          </h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {DOMEIN_STAPPEN.map((s, i) => (
              <li key={s.titel} className="rounded-2xl border border-hair bg-white p-6">
                <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 font-display text-lg font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-display text-xl font-bold text-ink">{s.titel}</h3>
                <p className="mt-2 text-neutralx-600">{s.tekst}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* domein samen met een website */}
      <section className="bg-paper" aria-labelledby="bundel-titel">
        <div className="shell pb-16 md:pb-20">
          <div className="grid items-center gap-10 rounded-3xl bg-mintwash p-6 md:p-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h2 id="bundel-titel" className="font-display text-3xl font-bold text-ink">
                Domein met website nodig?
              </h2>
              <p className="mt-3 text-[17px] leading-relaxed text-neutralx-700">
                Heb je een websiteabonnement van ZekerFlex (Basis of Pro)? Dan is je eerste {BUNDEL_TEKST}-domein het eerste jaar inbegrepen. We koppelen hem
                meteen aan je site, met een beveiligde verbinding.
              </p>
              <ul className="mt-5 space-y-2 text-neutralx-700">
                <li className="flex gap-2">
                  <Vinkje />
                  Domein + website of webshop
                </li>
                <li className="flex gap-2">
                  <Vinkje />
                  Automatisch gekoppeld, met https
                </li>
                <li className="flex gap-2">
                  <Vinkje />
                  Zakelijke e-mail op je domein (binnenkort)
                </li>
              </ul>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/aanbod/website" className="btn-primary">
                  Bekijk de website
                </Link>
                <Link href="/aanbod/webshop" className="btn-ghost bg-white">
                  Bekijk de webshop
                </Link>
              </div>
            </div>
            {/* een voorbeeld van een site op een eigen domein (alleen vormen, geen echte site) */}
            <div aria-hidden className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
              <div className="flex items-center gap-2 border-b border-hair bg-paper-soft px-3 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                <span className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs text-neutralx-600 ring-1 ring-hair">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-brand-600" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" />
                  </svg>
                  <span className="truncate">
                    <span className="font-semibold text-ink">jouwbedrijf</span>.nl
                  </span>
                </span>
              </div>
              <div className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <span className="h-3 w-24 rounded-full bg-ink/80" />
                  <span className="flex gap-2">
                    <span className="h-2 w-10 rounded-full bg-neutralx-200" />
                    <span className="h-2 w-10 rounded-full bg-neutralx-200" />
                    <span className="h-2 w-10 rounded-full bg-neutralx-200" />
                  </span>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 p-5">
                  <span className="block h-4 w-3/5 rounded-full bg-white/90" />
                  <span className="mt-3 block h-2.5 w-4/5 rounded-full bg-white/50" />
                  <span className="mt-4 block h-7 w-28 rounded-full bg-white" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="rounded-lg border border-hair p-3">
                      <span className="block h-8 rounded-md bg-mintwash" />
                      <span className="mt-2 block h-2 w-4/5 rounded-full bg-neutralx-200" />
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* waarom bij ZekerFlex */}
      <section className="bg-paper-soft" aria-labelledby="voordelen-titel">
        <div className="shell py-16 md:py-20">
          <h2 id="voordelen-titel" className="text-center font-display text-3xl font-bold text-ink md:text-4xl">
            Een domeinnaam bij <span className="text-brand-600">ZekerFlex</span>
          </h2>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {DOMEIN_VOORDELEN.map((v) => (
              <li key={v.titel} className="rounded-2xl border border-hair bg-white p-6">
                <VoordeelIcoon soort={v.icoon} />
                <h3 className="mt-4 font-display text-lg font-bold text-ink">{v.titel}</h3>
                <p className="mt-2 text-neutralx-600">{v.tekst}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* verhuizen */}
      <section className="bg-paper" aria-labelledby="verhuizen-titel">
        <div className="shell py-16 md:py-20">
          <div className="grid gap-10 lg:grid-cols-[1.3fr_0.7fr]">
            <div>
              <h2 id="verhuizen-titel" className="font-display text-3xl font-bold text-ink md:text-4xl">
                Verhuis je domein <span className="text-brand-600">eenvoudig</span>
              </h2>
              <p className="mt-3 max-w-2xl text-[17px] text-neutralx-700">
                Staat je domein nu ergens anders? Breng hem naar ZekerFlex, dan staan je naam en je website op één plek.
              </p>
              <ol className="mt-8 space-y-5">
                {VERHUIS_STAPPEN.map((s, i) => (
                  <li key={s.titel} className="flex gap-4">
                    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-brand-600 font-display font-bold text-brand-700">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="font-display text-lg font-bold text-ink">{s.titel}</h3>
                      <p className="mt-1 text-neutralx-600">{s.tekst}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <a href="#zoek" className="btn-primary mt-8 inline-flex">
                Naar verhuizen
              </a>
            </div>
            <aside className="h-fit rounded-2xl border border-hair bg-white p-6">
              <h2 className="font-display text-xl font-bold text-ink">Liever bij je huidige provider blijven?</h2>
              <p className="mt-2 text-neutralx-600">
                Dat kan ook. Koppel je eigen domein dan aan je website van ZekerFlex, in de websitebouwer op het tabblad Domein. Je domein blijft waar het
                is.
              </p>
              <Link href="/aanbod/website" className="mt-4 inline-block font-semibold text-brand-600 underline">
                Over de website van ZekerFlex
              </Link>
            </aside>
          </div>
        </div>
      </section>

      {/* het aanbod: de populaire extensies groot, daaronder alle extensies */}
      <section className="bg-paper-soft" aria-labelledby="prijzen-titel">
        <div className="shell py-16 md:py-20">
          <h2 id="prijzen-titel" className="text-center font-display text-3xl font-bold text-ink md:text-4xl">
            Populaire <span className="text-brand-600">extensies</span>
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-neutralx-600">
            Prijzen per jaar, excl. btw. Verhuizen kost hetzelfde als een jaar verlengen; bij .nl is verhuizen gratis.
          </p>
          {/* op de telefoon twee naast elkaar, anders wordt het een lange rij */}
          <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {kaarten.map((k) => (
              <li key={k.tld} className="flex flex-col rounded-2xl border border-hair bg-white p-4 sm:p-6">
                <h3 className="font-display text-2xl font-bold text-ink sm:text-3xl">.{k.tld}</h3>
                <p className="mt-1 text-sm text-neutralx-600">{k.omschrijving}</p>
                <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-neutralx-500 sm:mt-5 sm:text-[13px]">Eerste jaar</p>
                <p className="font-display text-2xl font-bold text-ink sm:text-3xl">{k.eersteJaar}</p>
                <p className="text-xs text-neutralx-500">{k.eersteJaarIncl} incl. btw</p>
                <p className="mt-3 text-sm text-neutralx-700">
                  Daarna <strong className="text-ink">{k.daarna}</strong> per jaar
                </p>
                {k.inBundel && (
                  <p className="mt-4 rounded-lg bg-mintwash px-3 py-2 text-xs font-semibold text-brand-700">Eerste jaar inbegrepen bij je website</p>
                )}
                <div className="mt-auto pt-5">
                  <a href="#zoek" className="btn-ghost w-full justify-center text-sm">
                    Zoek je .{k.tld}
                  </a>
                </div>
              </li>
            ))}
          </ul>

          <div className="mx-auto mt-14 max-w-4xl rounded-2xl border border-hair bg-white p-5 md:p-7">
            <h3 className="font-display text-xl font-bold text-ink">Alle extensies</h3>
            {/* past op de telefoon zonder vegen: daar zonder de kolom Waarvoor */}
            <div className="relative mt-4">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Prijzen van domeinnamen per jaar, excl. btw</caption>
                <thead>
                  <tr className="border-b border-hair text-neutralx-500">
                    <th scope="col" className="py-2 font-semibold">
                      Extensie
                    </th>
                    <th scope="col" className="hidden py-2 font-semibold sm:table-cell">
                      Waarvoor
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      Eerste jaar
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      Daarna per jaar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {EXTENSIES.map((e) => (
                    <tr key={e.tld} className="border-b border-hair last:border-b-0">
                      <th scope="row" className="py-2.5 font-display font-bold text-ink">
                        .{e.tld}
                      </th>
                      <td className="hidden py-2.5 text-neutralx-600 sm:table-cell">{e.omschrijving}</td>
                      <td className="py-2.5 text-right font-semibold text-ink">{euroPrijs(e.prijsCent)}</td>
                      <td className="py-2.5 text-right text-ink">{euroPrijs(e.verlengCent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-paper" aria-labelledby="faq-titel">
        <div className="shell py-16 md:py-20">
          <h2 id="faq-titel" className="font-display text-3xl font-bold text-ink">
            Veelgestelde vragen
          </h2>
          <div className="mt-8 max-w-3xl">
            <FaqList items={DOMEIN_FAQ} />
          </div>
        </div>
      </section>

      <CtaBand
        title="Je naam online begint hier"
        body="Zoek je domeinnaam, of bekijk wat ZekerFlex nog meer voor je bedrijf doet: website, webshop, reviews en personeel."
        primaryHref="#zoek"
        primaryLabel="Zoek je domeinnaam"
        secondaryHref="/aanbod"
        secondaryLabel="Bekijk het aanbod"
      />
    </>
  );
}
