import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { DbaCheck } from "@/components/marketing/rekentools/DbaCheck";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

const PATH = "/rekentools/wet-dba-check";

export const metadata: Metadata = {
  title: "Wet DBA-check — loop je risico op schijnzelfstandigheid?",
  description:
    "Doe gratis de Wet DBA-check: tien vragen over gezag, inbedding, duur, vervanging en ondernemerschap. Je ziet direct waar je opdracht op loondienst lijkt en wat je eraan kunt doen.",
  keywords: ["wet dba check", "schijnzelfstandigheid check", "dba check zzp", "zzp'er inhuren risico", "beoordeling arbeidsrelatie", "verkapt dienstverband"],
  ...canonical(PATH, { fileImage: true }),
};

const FAQ = [
  {
    q: "Wat is de Wet DBA?",
    a: "De Wet deregulering beoordeling arbeidsrelaties gaat over de vraag of iemand echt als zelfstandige werkt of eigenlijk in loondienst is. Sinds 1 januari 2025 controleert de Belastingdienst daar weer op. Is het loondienst, dan kan de opdrachtgever een naheffing voor loonheffingen en premies krijgen.",
  },
  {
    q: "Waar kijken de rechter en de Belastingdienst naar?",
    a: "Naar het totaalbeeld van hoe jullie in de praktijk samenwerken: wie bepaalt hoe het werk gaat, hoe ingebed de zzp'er in je organisatie is, hoe lang en hoeveel er gewerkt wordt, of vervanging mag, en of de zzp'er zich als ondernemer gedraagt, met meerdere opdrachtgevers, eigen risico en een passend tarief.",
  },
  {
    q: "Is deze check een officiële beoordeling?",
    a: "Nee. De check geeft een indicatie op basis van je antwoorden. Een rechter of de Belastingdienst weegt alle omstandigheden samen. Twijfel je, laat de situatie dan beoordelen door een adviseur.",
  },
  {
    q: "Hoe helpt ZekerFlex hierbij?",
    a: "Zzp'ers kiezen op ZekerFlex zelf hun klussen, de afspraken per opdracht worden vastgelegd en je krijgt een seintje bij signalen zoals veel uren bij één opdrachtgever. Heb je mensen nodig die onder jouw leiding werken, dan kan dat via het ZekerFlex-uitzendbureau.",
  },
];

export default function WetDbaCheckPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([["Home", "/"], ["Rekentools", "/rekentools"], ["Wet DBA-check", PATH]]),
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
            · voor opdrachtgevers en zzp&apos;ers
          </p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">
            Wet DBA-check
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Tien vragen over hoe je met een zzp&apos;er samenwerkt. Je ziet meteen waar het op loondienst lijkt en wat je
            eraan kunt doen.
          </p>
        </div>
      </div>

      <Section tone="soft">
        <DbaCheck />
      </Section>

      <Section tone="paper">
        <SectionHead
          eyebrow="Meer weten"
          title="Alles over de Wet DBA"
          intro="Wat mag wel en niet bij instructies geven, hoe zit het met de 650-urengrens en wat verandert er met de Zelfstandigenwet?"
        />
        <div className="mt-8">
          <Link href="/kennis/wet-dba" className="btn-primary">
            Naar de uitleg over de Wet DBA
          </Link>
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Over de Wet DBA-check" />
        <div className="mt-10">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand
        title="Zzp'ers inhuren met minder zorgen"
        body="Afspraken per opdracht vastgelegd, signalen op tijd in beeld. Je betaalt alleen voor gewerkte uren."
        primaryHref="/register?type=bedrijf"
        primaryLabel="Klus plaatsen"
        secondaryHref="/demo"
        secondaryLabel="Demo aanvragen"
      />
    </>
  );
}
