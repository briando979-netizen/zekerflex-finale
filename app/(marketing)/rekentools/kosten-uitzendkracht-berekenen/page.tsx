import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { KostenFlexkracht } from "@/components/marketing/rekentools/KostenFlexkracht";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

const PATH = "/rekentools/kosten-uitzendkracht-berekenen";

export const metadata: Metadata = {
  title: "Kosten uitzendkracht of zzp'er berekenen — gratis rekentool",
  description:
    "Wat kost een uitzendkracht per uur, en wat een zzp'er via ZekerFlex? Vul uurloon, omrekenfactor en uren in en zie direct het verschil per uur en voor de hele periode.",
  keywords: [
    "kosten uitzendkracht berekenen",
    "wat kost een uitzendkracht",
    "omrekenfactor uitzendbureau",
    "uitzendbureau tarief berekenen",
    "zzp'er inhuren kosten",
    "flexkracht kosten per uur",
  ],
  ...canonical(PATH, { fileImage: true }),
};

const FAQ = [
  {
    q: "Wat is een omrekenfactor?",
    a: "Het getal waarmee een uitzendbureau het bruto uurloon vermenigvuldigt om tot het uurtarief voor jou te komen. Daarin zitten de werkgeverslasten, zoals vakantiegeld, premies en pensioen, en de marge van het bureau. Een factor van 1,9 bij € 16 bruto betekent € 30,40 per uur.",
  },
  {
    q: "Wat kost een uitzendkracht per uur?",
    a: "Bruto uurloon maal de omrekenfactor. Met een factor tussen 1,6 en 2,2 betaal je voor een kracht van € 16 bruto ruwweg € 26 tot € 35 per uur, zonder btw.",
  },
  {
    q: "Wat kost een zzp'er of flexwerker via ZekerFlex?",
    a: "Het uurtarief van de kracht plus € 3,50 platformkosten per gewerkt uur. Vanaf 500 uur per maand daalt dat bedrag stap voor stap tot € 2,50. Er is geen abonnement en je betaalt geen opstartkosten.",
  },
  {
    q: "Is een zzp'er inhuren hetzelfde als een uitzendkracht?",
    a: "Nee. Een uitzendkracht is in dienst van het uitzendbureau en werkt onder jouw leiding. Een zzp'er is zelfstandig ondernemer. Let daarbij op de Wet DBA: het werk mag in de praktijk geen verkapt dienstverband zijn. ZekerFlex legt de afspraken vast en signaleert risico's.",
  },
  {
    q: "Kan ik via ZekerFlex ook uitzendkrachten inhuren?",
    a: "Ja. Het ZekerFlex-uitzendbureau regelt de loonadministratie, het StiPP-pensioen en de ABU-cao. Je vraagt daar een tarief op maat aan.",
  },
];

export default function KostenUitzendkrachtPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([["Home", "/"], ["Rekentools", "/rekentools"], ["Kosten uitzendkracht berekenen", PATH]]),
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
            · voor bedrijven
          </p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">
            Wat kost een flexkracht?
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Zet een uitzendbureau naast een zzp&apos;er of flexwerker via ZekerFlex. Met jouw uurloon, jouw omrekenfactor
            en jouw uren, per uur en voor de hele periode.
          </p>
        </div>
      </div>

      <Section tone="soft">
        <KostenFlexkracht />
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Zo rekenen we" title="Twee manieren om iemand in te huren" />
        <div className="mt-10 grid gap-x-10 gap-y-8 text-[0.975rem] leading-relaxed text-neutralx-600 md:grid-cols-2">
          <div>
            <h3 className="font-display text-xl font-semibold text-ink">Uitzendbureau</h3>
            <p className="mt-2">
              Het bureau is de werkgever. Het betaalt het loon, het vakantiegeld, de premies en het pensioen, en rekent
              jou het bruto uurloon maal een omrekenfactor. Die factor verschilt per bureau, cao en functie. Vul daarom
              de factor in die op je eigen offerte staat.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold text-ink">Zzp&apos;er of flexwerker via ZekerFlex</h3>
            <p className="mt-2">
              De kracht is zelfstandig en bepaalt zelf het uurtarief. Jij betaalt dat tarief plus € 3,50 platformkosten
              per gewerkt uur, alleen als er echt gewerkt is. Werkt je organisatie meer dan 500 uur per maand via
              ZekerFlex, dan zakt de fee per uur. Zie{" "}
              <Link href="/prijzen" className="text-brand-600 underline">
                prijzen
              </Link>{" "}
              voor de hele staffel.
            </p>
          </div>
          <div className="md:col-span-2">
            <h3 className="font-display text-xl font-semibold text-ink">Waar je op moet letten</h3>
            <p className="mt-2">
              Een zzp&apos;er werkt zelfstandig, niet als werknemer. Lees wat dat betekent onder de{" "}
              <Link href="/kennis/wet-dba" className="text-brand-600 underline">
                Wet DBA
              </Link>
              . Heb je mensen nodig die onder jouw leiding werken, dan is een uitzendkracht de juiste keuze. Dat kan ook
              via het{" "}
              <Link href="/uitzendbureau" className="text-brand-600 underline">
                ZekerFlex-uitzendbureau
              </Link>
              .
            </p>
          </div>
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Over de kosten van flexkrachten" />
        <div className="mt-10">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand
        title="Plaats je eerste klus gratis"
        body="Je betaalt pas als er gewerkt is. Geen abonnement, geen opstartkosten."
        primaryHref="/register?type=bedrijf"
        primaryLabel="Klus plaatsen"
        secondaryHref="/demo"
        secondaryLabel="Demo aanvragen"
      />
    </>
  );
}
