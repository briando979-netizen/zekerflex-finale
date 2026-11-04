import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, FaqList } from "@/components/marketing/primitives";
import { DomeinZoeker } from "@/components/domeinen/DomeinZoeker";
import { BUNDEL_TLDS, EXTENSIES, euroPrijs } from "@/lib/domeinen/extensies";
import { breadcrumbJsonLd, canonical, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

const TITLE = "Domeinnaam registreren of verhuizen";
const DESCRIPTION =
  "Zoek direct of je domeinnaam nog vrij is: .nl, .com, .eu, .be en meer, voor een eerlijke prijs per jaar. Of verhuis je bestaande domein naar ZekerFlex, los of samen met je website of webshop.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ZekerFlex` },
  description: DESCRIPTION,
  keywords: ["domeinnaam registreren", "domeinnaam kopen", "domein verhuizen", "nl domein", "domeinnaam checken", "domeinnaam beschikbaar"],
  ...canonical("/domeinnaam", { title: TITLE, description: DESCRIPTION }),
};

const bundel = BUNDEL_TLDS.map((t) => `.${t}`).join(", ").replace(/, ([^,]*)$/, " of $1");

const FAQ = [
  {
    q: "Hoe weet ik of een domeinnaam vrij is?",
    a: "Typ de naam in de zoekbalk. We vragen het register van elke extensie direct, en zien zo of de naam al bezet is. Bij .eu, .be, .de en .nu kijken we of de naam in gebruik is; daar staat dan 'waarschijnlijk vrij'. Bij het aanvragen controleren we het altijd nog een keer.",
  },
  {
    q: "Wat is verhuizen?",
    a: "Je houdt je eigen domeinnaam; alleen de partij die hem voor je beheert, wordt ZekerFlex. Je vraagt bij je huidige provider een verhuiscode (ook wel autorisatiecode of token) op en geeft die aan ons. Je website en e-mail blijven tijdens het verhuizen gewoon werken.",
  },
  {
    q: "Ik heb al een domein elders. Moet ik verhuizen?",
    a: "Nee. Je kunt je eigen domein ook gewoon koppelen aan je website van ZekerFlex en het bij je huidige provider laten. Dat doe je in de websitebouwer, op het tabblad Domein.",
  },
  {
    q: "Wat kost een domeinnaam?",
    a: `De prijzen staan hierboven, per jaar en excl. btw. Een .nl kost ${euroPrijs(EXTENSIES[0]?.prijsCent ?? 995)} per jaar. Heb je een website of webshop van ZekerFlex, dan is je ${bundel} het eerste jaar inbegrepen.`,
  },
  {
    q: "Kan ik mijn domein later opzeggen of meenemen?",
    a: "Ja. Je domein verlengt per jaar. Wil je het niet meer, dan zeg je het op voor de verlengdatum. Wil je naar een andere provider, dan krijg je van ons de verhuiscode.",
  },
];

// Domeinnaam zoeken, registreren of verhuizen (lib/domeinen). Aanvragen landen
// voorlopig in de sales-pijplijn; online bestellen en betalen volgt.
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
        dangerouslySetInnerHTML={{ __html: ldJson([dienst, breadcrumbJsonLd([["Home", "/"], ["Aanbod", "/aanbod"], ["Domeinnaam", "/domeinnaam"]])]) }}
      />
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <p className="eyebrow text-brand-mint">
            <Link href="/aanbod#online" className="hover:underline">
              Online &amp; klanten
            </Link>{" "}
            · Domeinnaam
          </p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold md:text-6xl">Jouw eigen domeinnaam</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/70">
            Zoek direct of je naam nog vrij is. Registreer hem voor een eerlijke prijs, of verhuis je bestaande domein naar ZekerFlex. Los, of
            samen met je website, webshop en e-mail.
          </p>
        </div>
      </div>

      <section className="bg-paper" aria-labelledby="zoek-titel">
        <div className="shell py-12 md:py-16">
          <h2 id="zoek-titel" className="font-display text-2xl font-bold text-ink">
            Is jouw naam nog vrij?
          </h2>
          <div className="mt-5 max-w-3xl">
            <DomeinZoeker />
          </div>
        </div>
      </section>

      <section className="bg-paper-soft" aria-labelledby="manieren-titel">
        <div className="shell py-16 md:py-20">
          <h2 id="manieren-titel" className="font-display text-3xl font-bold text-ink">
            Drie manieren
          </h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            <li className="rounded-2xl border border-hair bg-white p-6">
              <h3 className="font-display text-xl font-bold text-ink">Nieuw registreren</h3>
              <p className="mt-2 text-neutralx-600">Je kiest een vrije naam, wij leggen hem vast en koppelen hem meteen aan je website of webshop.</p>
            </li>
            <li className="rounded-2xl border border-hair bg-white p-6">
              <h3 className="font-display text-xl font-bold text-ink">Verhuizen</h3>
              <p className="mt-2 text-neutralx-600">Je bestaande domein komt naar ZekerFlex. Je hebt alleen de verhuiscode van je huidige provider nodig.</p>
            </li>
            <li className="rounded-2xl border border-hair bg-white p-6">
              <h3 className="font-display text-xl font-bold text-ink">Je eigen domein koppelen</h3>
              <p className="mt-2 text-neutralx-600">
                Wil je je domein bij je huidige provider houden? Koppel het dan aan je{" "}
                <Link href="/aanbod/website" className="font-semibold text-brand-600 underline">
                  website van ZekerFlex
                </Link>
                .
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section className="bg-paper" aria-labelledby="prijzen-titel">
        <div className="shell py-16 md:py-20">
          <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
            <div className="min-w-0">
              <h2 id="prijzen-titel" className="font-display text-3xl font-bold text-ink">
                Prijzen per jaar
              </h2>
              <p className="mt-2 text-neutralx-600">Excl. btw. Verhuizen kost hetzelfde als een jaar verlengen; bij .nl is verhuizen gratis.</p>
              <table className="mt-6 w-full text-left text-sm">
                <caption className="sr-only">Prijzen van domeinnamen per jaar, excl. btw</caption>
                <thead>
                  <tr className="border-b border-hair text-neutralx-500">
                    <th scope="col" className="py-2 font-semibold">
                      Extensie
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      Waarvoor
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      Per jaar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {EXTENSIES.map((e) => (
                    <tr key={e.tld} className="border-b border-hair">
                      <th scope="row" className="py-2.5 font-display font-bold text-ink">
                        .{e.tld}
                      </th>
                      <td className="py-2.5 text-neutralx-600">{e.omschrijving}</td>
                      <td className="py-2.5 text-right font-semibold text-ink">{euroPrijs(e.prijsCent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <aside className="h-fit rounded-2xl border border-hair bg-white p-6">
              <h2 className="font-display text-xl font-bold text-ink">Samen voordeliger</h2>
              <p className="mt-2 text-neutralx-600">
                Heb je een website of webshop van ZekerFlex? Dan is je {bundel}-domein het eerste jaar inbegrepen. We koppelen hem meteen aan
                je site, met een beveiligde verbinding.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-neutralx-700">
                <li className="flex gap-2">
                  <span aria-hidden className="text-brand-500">
                    ✓
                  </span>
                  Domein + website of webshop
                </li>
                <li className="flex gap-2">
                  <span aria-hidden className="text-brand-500">
                    ✓
                  </span>
                  Automatisch gekoppeld, met https
                </li>
                <li className="flex gap-2">
                  <span aria-hidden className="text-brand-500">
                    ✓
                  </span>
                  Zakelijke e-mail op je domein (binnenkort)
                </li>
              </ul>
              <Link href="/aanbod/website" className="btn-primary mt-6 block w-full text-center text-sm">
                Bekijk de website
              </Link>
            </aside>
          </div>
        </div>
      </section>

      <section className="bg-paper-soft" aria-labelledby="faq-titel">
        <div className="shell py-16 md:py-20">
          <h2 id="faq-titel" className="font-display text-3xl font-bold text-ink">
            Veelgestelde vragen
          </h2>
          <div className="mt-8 max-w-3xl">
            <FaqList items={FAQ} />
          </div>
        </div>
      </section>

      <CtaBand
        title="Alles voor je bedrijf onder één dak"
        body="Domeinnaam, website, webshop, reviews en personeel: met één account."
        primaryHref="/aanbod"
        primaryLabel="Bekijk het aanbod"
        secondaryHref="/demo"
        secondaryLabel="Vraag een demo aan"
      />
    </>
  );
}
