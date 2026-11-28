import { vt } from "@/lib/i18n/site";
import { getSiteT } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { ldJson } from "@/lib/seo/json-ld";
import Link from "next/link";
import { Section, SectionHead, FaqList, CtaBand } from "@/components/marketing/primitives";
import { FULL_FAQ } from "@/lib/kennis/content";
import { canonical } from "@/lib/seo";

export const metadata: Metadata = {
  title: vt("Veelgestelde vragen"),
  description:
    vt("Antwoorden op de meest gestelde vragen over aanmelden, matching, uitbetaling, facturen en compliance bij ZekerFlex."),
  ...canonical("/kennis/faq"),
};

const faqPageLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  inLanguage: "nl-NL",
  mainEntity: FULL_FAQ.flatMap((group) =>
    group.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  ),
};

export default async function FaqPage() {
  const tx = await getSiteT();
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(faqPageLd) }}
      />
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <Link href="/kennis" className="text-sm font-medium text-white/60 hover:text-white">
            {tx("← Kennis")}
          </Link>
          <p className="eyebrow mt-6 text-brand-mint">{tx("FAQ")}</p>
          <h1 className="mt-3 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
            {tx("Veelgestelde vragen")}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/70">
            {tx("Kort antwoord op de vragen die we het vaakst krijgen. Staat je vraag er niet bij? Mail")}{" "}
            <a href="mailto:info@zekerflex.com" className="underline hover:text-white">
              {tx("info@zekerflex.com")}
            </a>
            .
          </p>
        </div>
      </div>

      {FULL_FAQ.map((group, i) => (
        <Section key={group.category} tone={i % 2 === 0 ? "paper" : "soft"}>
          <SectionHead eyebrow={tx("Veelgestelde vragen")} title={group.category} />
          <div className="mt-10">
            <FaqList items={group.items} />
          </div>
        </Section>
      ))}

      <CtaBand
        title={tx("Klaar om te beginnen?")}
        body={tx("Aanmelden is gratis en kost een paar minuten. Je zit nergens aan vast.")}
        primaryHref="/register"
        primaryLabel={tx("Account aanmaken")}
        secondaryHref="/kennis"
        secondaryLabel={tx("Terug naar Kennis")}
      />
    </>
  );
}
