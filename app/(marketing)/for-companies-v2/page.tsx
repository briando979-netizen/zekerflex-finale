import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { canonical, SITE } from "@/lib/seo";
import { seoTitel, seoBeschrijving } from "@/lib/seo-tekst";
import { ldJson } from "@/lib/seo/json-ld";
import { Reveal } from "@/components/marketing/Reveal";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";

const TITLE = "Vind 500 flexwerkers in 24 uur — ZekerFlex voor bedrijven";
const DESCRIPTION = "Direct toegang tot geverifieerde flexwerkers en zzp'ers. Plaats een klus, krijg aanbiedingen van werkzoekenden in jouw buurt, betaal alleen voor gewerkte uren.";

export const metadata: Metadata = {
  title: { absolute: seoTitel(TITLE) },
  description: seoBeschrijving(DESCRIPTION),
  keywords: ["flexwerkers vinden", "personeel inhuren", "uitzendbureau alternatief", "klus plaatsen", "zzp'ers", "flexkrachten"],
  ...canonical("/for-companies-v2", { title: TITLE, description: DESCRIPTION }),
};

const FAQ = [
  {
    q: "Hoe vind ik snel flexwerkers?",
    a: "Plaats een klus in enkele minuten: functie, locatie, datum en uurtarief. ZekerFlex deelt hem met geverifieerde werkers in jouw buurt. Je ziet hun profiel, reviews en ervaring, en kiest zelf wie je inroostert.",
  },
  {
    q: "Welke werkers zijn beschikbaar?",
    a: "Flexkrachten en zzp'ers die hebben geverifieerd: identiteitsbewijs, werkvergunning, en referenties zijn gecontroleerd. Je betaalt hun uurloon plus € 3,50 platformkosten per gewerkt uur.",
  },
  {
    q: "Hoe betaal ik?",
    a: "Enkel voor uren die echt gewerkt zijn. Zodra je de uren hebt goedgekeurd, maakt ZekerFlex de factuur automatisch. Geen abonnement, geen verborgen kosten.",
  },
  {
    q: "Kan ik voor meerdere locaties werken?",
    a: "Ja. Zet al je vestigingen in één account. Geef collega's per locatie toegang en behoud zelf het overzicht.",
  },
];

export default function ForCompaniesV2Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          }),
        }}
      />

      {/* Hero Section */}
      <section className="relative isolate overflow-hidden bg-[#0C0E12] text-white">
        <div className="absolute inset-x-0 top-0 -z-10 h-[22rem] md:inset-y-0 md:left-auto md:h-auto md:w-[40%]">
          <Image
            src="/werk/campagne-kop.jpg"
            alt="Jonge werker klaar voor dienst"
            fill
            priority
            sizes="(min-width: 768px) 40vw, 100vw"
            className="object-cover object-[50%_18%] md:object-[50%_28%]"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0C0E12] via-[#0C0E12]/30 via-40% to-transparent md:bg-gradient-to-r md:via-[#0C0E12]/40 md:via-25% md:to-50%" />
        </div>
        <div className="shell-4k relative pb-8 pt-[15rem] md:py-14 lg:py-16">
          <div className="max-w-xl md:max-w-sm lg:max-w-xl">
            <p className="eyebrow text-brand-mint">Voor HR-managers en bedrijven</p>
            <h1 className="fluid-hero mt-3 text-balance font-display font-bold">
              Vind{" "}
              <span className="bg-gradient-to-r from-brand-mint to-[#8FF0C4] bg-clip-text text-transparent">
                500 flexwerkers in 24h.
              </span>
            </h1>
            <p className="fluid-lead mt-4 max-w-lg text-white/75">
              Plaats je klus, krijg direct aanbiedingen van geverifieerde flexkrachten en zzp'ers in je buurt. Geen tussenhandelaar, geen lange procedures.
            </p>
            <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
              <Link href="/klus-plaatsen?utm_source=company-lp&utm_medium=cta" className="btn-mint text-base">
                Start gratis
              </Link>
              <Link href="#hoe-het-werkt" className="btn-ghost-invert text-base">
                Hoe het werkt
              </Link>
            </div>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-white/70">
              {["500+ geverifieerde werknemers", "Betaal alleen voor gewerkte uren", "Binnen 24 uur klaar"].map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <CheckIcon />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Social Proof / Trust */}
      <Section tone="soft">
        <div className="grid gap-8 md:grid-cols-3">
          <Reveal>
            <div className="text-center">
              <div className="font-display text-4xl font-bold text-brand-500">500+</div>
              <p className="mt-2 text-sm text-neutralx-600">Geverifieerde werknemers beschikbaar</p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="text-center">
              <div className="font-display text-4xl font-bold text-brand-500">€ 3,50</div>
              <p className="mt-2 text-sm text-neutralx-600">Platformkosten per gewerkt uur</p>
            </div>
          </Reveal>
          <Reveal delay={240}>
            <div className="text-center">
              <div className="font-display text-4xl font-bold text-brand-500">24h</div>
              <p className="mt-2 text-sm text-neutralx-600">Eerste match gemiddeld</p>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* How It Works */}
      <Section id="hoe-het-werkt">
        <SectionHead eyebrow="Hoe het werkt" title="In 3 eenvoudige stappen" />
        <div className="mt-10 grid gap-6 md:grid-cols-3 md:mt-16">
          {[
            {
              n: 1,
              title: "Plaats een klus",
              body: "Voer functie, locatie, datum, tijd en uurtarief in. Zien wat het kost en plaats hem online.",
            },
            {
              n: 2,
              title: "Krijg aanbiedingen",
              body: "Geverifieerde werkers in jouw buurt zien je klus. Je ziet hun profiel, reviews en ervaring.",
            },
            {
              n: 3,
              title: "Huur in en betaal",
              body: "Je kiest wie je inroostert. Betaal het uurtarief plus € 3,50 voor gewerkte uren.",
            },
          ].map((step, i) => (
            <Reveal key={step.n} delay={i * 120}>
              <div className="glass-light h-full rounded-3xl p-6 md:p-8">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 font-display text-lg font-bold text-white">
                  {step.n}
                </div>
                <h3 className="mt-6 font-display text-2xl font-semibold">{step.title}</h3>
                <p className="mt-3 text-[1.02rem] leading-relaxed text-neutralx-600">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section tone="soft">
        <SectionHead eyebrow="Mogelijkheden" title="Alles wat je nodig hebt" />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 md:mt-16">
          {[
            { icon: "🎯", title: "Gerichte matching", body: "Werkers in jouw buurt, met de juiste vaardigheden." },
            { icon: "✓", title: "Verificatie inbegrepen", body: "Alle werkers zijn geverifieerd: ID, referenties, werkrecht." },
            { icon: "💳", title: "Betaal wat je gebruikt", body: "Geen abonnement, geen inschrijfkosten. Alleen gewerkte uren." },
            { icon: "📱", title: "Alles op één plek", body: "Klussen plaatsen, uren goedkeuren, facturen — één omgeving." },
            { icon: "🔒", title: "Veilig betaald", body: "Veilige betaling via Stripe. Geen directe geldtransfers." },
            { icon: "📍", title: "Meerdere locaties", body: "Beheer al je vestigingen in één account. Geef collega's toegang." },
          ].map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 3) * 90}>
              <div className="glass-light h-full rounded-2xl p-6 md:p-7">
                <div className="text-3xl">{feature.icon}</div>
                <h3 className="mt-5 font-display text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{feature.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHead eyebrow="Veelgestelde vragen" title="Hoe ZekerFlex voor bedrijven werkt" />
        <div className="mt-8 max-w-3xl">
          <FaqList items={FAQ} />
        </div>
      </Section>

      {/* CTA */}
      <CtaBand
        title="Klaar om te starten?"
        body="Plaats vandaag nog je eerste klus. Geen creditcard nodig."
        primaryHref="/klus-plaatsen?utm_source=company-lp&utm_medium=cta&utm_content=footer"
        primaryLabel="Start gratis"
        secondaryHref="/bedrijven"
        secondaryLabel="Meer info"
      />
    </>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="flex-shrink-0 text-brand-mint">
      <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
