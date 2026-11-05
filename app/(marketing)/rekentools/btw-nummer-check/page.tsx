import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { BtwCheck } from "@/components/marketing/rekentools/BtwCheck";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

const PATH = "/rekentools/btw-nummer-check";

export const metadata: Metadata = {
  title: "Btw-nummer check — controleer gratis een btw-id of KVK-nummer",
  description:
    "Controleer gratis of een btw-nummer geldig is (alle EU-landen, via VIES) of zoek een KVK-nummer op in het Handelsregister. Direct uitslag, niets wordt bewaard.",
  keywords: ["btw nummer check", "btw nummer controleren", "vies check", "btw id controleren", "kvk nummer controleren", "btw nummer opzoeken", "btw nummer zzp controleren"],
  ...canonical(PATH, { fileImage: true }),
};

const FAQ = [
  {
    q: "Hoe ziet een Nederlands btw-nummer eruit?",
    a: "NL, dan negen cijfers, een B en twee cijfers: bijvoorbeeld NL001234567B01. Sinds 2020 hebben eenmanszaken een btw-id dat los staat van het burgerservicenummer. Op facturen hoort het btw-id, niet het oude omzetbelastingnummer.",
  },
  {
    q: "Wat is VIES?",
    a: "Het VAT Information Exchange System van de Europese Commissie. Elke lidstaat meldt daar welke btw-nummers actief zijn. Onze check vraagt het rechtstreeks bij VIES op; er zit geen eigen lijst tussen.",
  },
  {
    q: "Waarom staat er bij een geldig Nederlands nummer geen naam?",
    a: "Nederland geeft via VIES alleen door óf een nummer geldig is, niet van wie het is. Wil je de naam erbij, zoek dan het KVK-nummer op in het Handelsregister.",
  },
  {
    q: "Controleert dit ook of een bedrijf bestaat?",
    a: "Een geldig btw-nummer betekent dat het nummer actief is geregistreerd. Wie erachter zit en of het bedrijf nog actief is, zie je in het Handelsregister van de KVK; daar linken we bij een KVK-nummer direct naartoe.",
  },
  {
    q: "Bewaren jullie wat ik invul?",
    a: "Nee. Het nummer gaat naar VIES en het antwoord komt bij jou terecht. We tellen alleen hoe vaak de tool wordt gebruikt.",
  },
];

export default function BtwNummerCheckPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([["Home", "/"], ["Rekentools", "/rekentools"], ["Btw-nummer check", PATH]]),
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ]),
        }}
      />
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <p className="eyebrow text-brand-mint">
            <Link href="/rekentools" className="hover:underline">
              Rekentools
            </Link>{" "}
            · voor ondernemers en zzp&apos;ers
          </p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">Btw-nummer check</h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Controleer in een paar seconden of een btw-nummer geldig is, in elk EU-land, of zoek een KVK-nummer op. Gratis, zonder account, niets wordt bewaard.
          </p>
        </div>
      </div>

      <Section tone="soft">
        <BtwCheck />
      </Section>

      <Section tone="paper">
        <SectionHead
          eyebrow="Zo werkt het"
          title="Drie controles, één veld"
          intro="Typ een nummer en we herkennen zelf wat het is. Spaties, punten en streepjes mogen."
        />
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["Btw-nummer uit de EU", "We vragen het rechtstreeks op bij VIES van de Europese Commissie. Je ziet of het nummer actief is en, waar het land dat vrijgeeft, de naam en het adres."],
            ["Nederlands btw-id", "Eerst kijken we of de vorm klopt (NL + 9 cijfers + B + 2 cijfers), daarna doet VIES de controle."],
            ["KVK-nummer", "Acht cijfers: we controleren de vorm en linken naar het Handelsregister, waar je gratis de basisgegevens ziet."],
          ].map(([kop, tekst], i) => (
            <li key={kop} className="rounded-2xl border border-hair bg-white p-6">
              <span className="font-display text-3xl font-bold text-brand-500">{i + 1}</span>
              <p className="mt-2 font-semibold text-ink">{kop}</p>
              <p className="mt-1 text-sm text-neutralx-600">{tekst}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Over btw-nummers en de check" />
        <div className="mt-10">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand
        title="Op ZekerFlex is elk bedrijf al gecontroleerd"
        body="Bedrijven en zzp'ers worden bij aanmelding gecontroleerd op KVK en btw-nummer. Jij plaatst een klus en wij regelen de rest."
        primaryHref="/register?type=bedrijf"
        primaryLabel="Gratis account aanmaken"
        secondaryHref="/rekentools"
        secondaryLabel="Meer rekentools"
      />
    </>
  );
}
