import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand } from "@/components/marketing/primitives";
import { DbaAccordion } from "@/components/marketing/DbaAccordion";
import { WERKGEVER_HELP_GROUPS, werkgeverHelpFlat } from "@/lib/kennis/werkgevers-help";

export const metadata: Metadata = {
  title: "Helpcentrum voor opdrachtgevers",
  description:
    "Alles over werken met ZekerFlex als opdrachtgever: account en facturatie, een dienst plaatsen, een kracht kiezen, uren goedkeuren en wat te doen als er iets misgaat.",
  alternates: { canonical: "/kennis/werkgevers" },
};

export default function WerkgeversHelpPage() {
  const faq = werkgeverHelpFlat();
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />

      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-24">
          <Link href="/kennis" className="text-sm font-medium text-white/60 hover:text-white">
            ← Kennis
          </Link>
          <p className="eyebrow mt-6 text-brand-mint">Helpcentrum voor opdrachtgevers</p>
          <h1 className="mt-3 max-w-3xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
            Werken met ZekerFlex als opdrachtgever
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/70">
            Van je account en facturatie tot een dienst plaatsen, een kracht kiezen en uren goedkeuren —
            de vragen die opdrachtgevers ons het vaakst stellen.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register?type=bedrijf" className="btn-mint">
              Organisatie aanmelden
            </Link>
            <Link href="/kennis/wet-dba" className="btn-ghost-invert">
              Wet DBA-kenniscentrum
            </Link>
          </div>
        </div>
      </div>

      {WERKGEVER_HELP_GROUPS.map((g, i) => (
        <Section key={g.category} tone={i % 2 === 0 ? "paper" : "soft"}>
          <SectionHead eyebrow="Helpcentrum" title={g.category} intro={g.blurb} />
          <div className="mt-8">
            <DbaAccordion items={g.items} />
          </div>
        </Section>
      ))}

      <CtaBand
        title="Staat je vraag er niet bij?"
        body="Neem contact op, dan helpen we je verder."
        primaryHref="mailto:support@zekerflex.com"
        primaryLabel="Stel je vraag"
        secondaryHref="/kennis"
        secondaryLabel="Terug naar het overzicht"
      />
    </>
  );
}
