import type { Metadata } from "next";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { canonical } from "@/lib/seo";
import { SaasPlans } from "@/components/marketing/SaasPlans";

const title = "Abonnementen — ZekerFlex voor bedrijven";
const description =
  "Gratis starten en alleen €3,50 per gewerkt uur, of een maandabonnement (Pro/Business) dat AI-recruiter, snelle uitbetaling, uitzend (ABU/StiPP) en de bank ontsluit. Geen opstartkosten, maandelijks opzegbaar.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["zekerflex abonnement", "uitzendsoftware prijs", "recruitment software maandabonnement", "flexpool software"],
  ...canonical("/abonnementen", { title, description }),
};

const FAQ = [
  { q: "Moet ik een abonnement nemen?", a: "Nee. Starter is gratis; je betaalt alleen €3,50 per gewerkt uur. Een abonnement (Pro/Business) ontsluit extra modules als je die wilt." },
  { q: "Komt de €3,50/uur bovenop het abonnement?", a: "Ja, die platformfee geldt los van het abonnement en alleen bij daadwerkelijk gewerkte uren — bij meer volume daalt hij volgens de staffel (zie /prijzen)." },
  { q: "Kan ik maandelijks opzeggen?", a: "Ja. Je beheert je abonnement (wijzigen of opzeggen) zelf via de beveiligde Stripe-portal in je werkgeversomgeving." },
  { q: "Wat zit er in Enterprise?", a: "Alles uit Business plus eigen merk/white-label, SSO en SLA — op maat. Neem contact op via sales@zekerflex.com." },
];

export default function AbonnementenPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">Abonnementen</p>
          <h1 className="mt-4 font-display text-4xl font-bold md:text-6xl">Kies wat bij je past</h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Gratis beginnen kan altijd. Wil je sneller werven en uitbetalen, uitzenden met ABU/StiPP of de bank gebruiken? Zet een
            maandabonnement erbij — maandelijks opzegbaar, geen opstartkosten.
          </p>
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow="Pakketten" title="Eén platform, groeit met je mee" intro="De €3,50/uur blijft de basis; het abonnement ontsluit de extra modules." />
        <SaasPlans />
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Veelgestelde vragen" title="Goed om te weten" />
        <div className="mt-8">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand
        title="Begin gratis, upgrade wanneer je wilt"
        body="Maak een account aan en probeer de marktplaats; een abonnement activeer je later met één klik vanuit je werkgeversomgeving."
        primaryHref="/register"
        primaryLabel="Gratis account"
        secondaryHref="/voor-bureaus"
        secondaryLabel="Zelf aanbieden (white-label)"
      />
    </>
  );
}
