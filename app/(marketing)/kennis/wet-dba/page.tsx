import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand } from "@/components/marketing/primitives";
import { DbaAccordion } from "@/components/marketing/DbaAccordion";
import { BELASTINGDIENST_CHECKLIST, DBA_GROUPS, dbaFaqFlat } from "@/lib/kennis/dba";

export const metadata: Metadata = {
  title: "Wet DBA voor opdrachtgevers",
  description:
    "Schijnzelfstandigheid, gezag en instructies, handhaving in 2026 en de nieuwe Zelfstandigenwet — en hoe ZekerFlex het risico voor opdrachtgevers klein houdt.",
  alternates: { canonical: "/kennis/wet-dba" },
};

export default function WetDbaPage() {
  const faq = dbaFaqFlat();
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
          <p className="eyebrow mt-6 text-brand-mint">Wet DBA voor opdrachtgevers</p>
          <h1 className="mt-3 max-w-3xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
            Mag ik morgen nog gewoon een freelancer inhuren?
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/70">
            Ja. De Belastingdienst handhaaft weer, maar we zitten in een overgangsfase. Dit is wat de regels
            écht betekenen, en hoe ZekerFlex het risico op schijnzelfstandigheid voor jou zo klein mogelijk maakt.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/voor-bedrijven#dba" className="btn-mint">
              Zo werkt de Wet DBA-monitor
            </Link>
            <Link href="/register?type=bedrijf" className="btn-ghost-invert">
              Organisatie aanmelden
            </Link>
          </div>
        </div>
      </div>

      {/* Belastingdienst-checklist */}
      <Section tone="paper">
        <SectionHead eyebrow="Voorbereiden" title={BELASTINGDIENST_CHECKLIST.title} intro={BELASTINGDIENST_CHECKLIST.intro} />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {BELASTINGDIENST_CHECKLIST.points.map((p) => (
            <div key={p.label} className="rounded-2xl border border-hair bg-paper p-5">
              <h3 className="font-display text-base font-bold text-ink">{p.label}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">{p.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Q&A groepen */}
      {DBA_GROUPS.map((g, i) => (
        <Section key={g.category} tone={i % 2 === 0 ? "soft" : "paper"}>
          <SectionHead eyebrow="Wet DBA" title={g.category} intro={g.blurb} />
          <div className="mt-8">
            <DbaAccordion items={g.items} />
          </div>
        </Section>
      ))}

      <Section tone="soft">
        <SectionHead eyebrow="Ook interessant" title="Verder lezen" />
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            { href: "/kennis/wet-dba-uitgelegd", t: "Wet DBA uitgelegd", d: "De basis in de kennisbank, kort en concreet." },
            { href: "/kennis/blog/handhaving-wet-dba-2026", t: "Handhaving Wet DBA 2026", d: "Wat de hervatte handhaving in de praktijk betekent." },
            { href: "/kennis/whitepapers", t: "Whitepapers", d: "Belasting, administratie en verzekering als pdf." },
          ].map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group rounded-2xl border border-hair bg-paper p-6 shadow-e1 transition-all hover:-translate-y-1 hover:shadow-e3"
            >
              <h3 className="font-display text-lg font-semibold text-ink">{c.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{c.d}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                Lezen <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-8 text-sm text-neutralx-500">
          Algemene informatie, geen juridisch of fiscaal advies. Regels en bedragen kunnen wijzigen — raadpleeg
          bij twijfel de Belastingdienst of een adviseur.
        </p>
      </Section>

      <CtaBand
        title="Is je vraag niet beantwoord?"
        body="Stel je vraag rechtstreeks, dan kijken we met je mee."
        primaryHref="mailto:sales@zekerflex.com"
        primaryLabel="Stel je vraag"
        secondaryHref="/kennis"
        secondaryLabel="Terug naar het overzicht"
      />
    </>
  );
}
