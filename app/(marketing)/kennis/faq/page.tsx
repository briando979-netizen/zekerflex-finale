import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, FaqList, CtaBand } from "@/components/marketing/primitives";
import { FULL_FAQ } from "@/lib/kennis/content";

export const metadata: Metadata = {
  title: "Veelgestelde vragen",
  description:
    "Antwoorden op de meest gestelde vragen over aanmelden, matching, uitbetaling, facturen en compliance bij ZekerFlex.",
};

export default function FaqPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <Link href="/kennis" className="text-sm font-medium text-white/60 hover:text-white">
            ← Kennis
          </Link>
          <p className="eyebrow mt-6 text-brand-mint">FAQ</p>
          <h1 className="mt-3 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
            Veelgestelde vragen
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/70">
            Kort antwoord op de vragen die we het vaakst krijgen. Staat je vraag er niet bij? Mail{" "}
            <a href="mailto:info@zekerflex.com" className="underline hover:text-white">
              info@zekerflex.com
            </a>
            .
          </p>
        </div>
      </div>

      {FULL_FAQ.map((group, i) => (
        <Section key={group.category} tone={i % 2 === 0 ? "paper" : "soft"}>
          <SectionHead eyebrow="Veelgestelde vragen" title={group.category} />
          <div className="mt-10">
            <FaqList items={group.items} />
          </div>
        </Section>
      ))}

      <CtaBand
        title="Klaar om te beginnen?"
        body="Aanmelden is gratis en kost een paar minuten. Je zit nergens aan vast."
        primaryHref="/register"
        primaryLabel="Account aanmaken"
        secondaryHref="/kennis"
        secondaryLabel="Terug naar Kennis"
      />
    </>
  );
}
