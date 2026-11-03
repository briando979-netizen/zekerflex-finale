import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { ZzpUurtarief } from "@/components/marketing/rekentools/ZzpUurtarief";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

const PATH = "/rekentools/zzp-uurtarief-berekenen";

export const metadata: Metadata = {
  title: "Zzp uurtarief berekenen — gratis rekentool",
  description:
    "Bereken welk uurtarief je als zzp'er nodig hebt voor het netto inkomen dat je wilt. Met vakantie, ziekte, pensioen, AOV, zakelijke kosten en belasting. Of reken andersom: wat houd je over?",
  keywords: ["zzp uurtarief berekenen", "uurtarief berekenen zzp", "zzp tarief", "uurtarief freelancer", "wat houd ik over als zzp'er", "netto inkomen zzp"],
  ...canonical(PATH, { fileImage: true }),
};

const FAQ = [
  {
    q: "Hoe bereken ik mijn uurtarief als zzp'er?",
    a: "Tel op wat je per jaar nodig hebt: je netto inkomen, de belasting daarover, pensioen, een arbeidsongeschiktheidsverzekering en je zakelijke kosten. Deel dat door het aantal uren dat je echt kunt factureren. Dat zijn er minder dan je denkt: vakantie, feestdagen, ziekte en tijd voor klanten zoeken en administratie gaan eraf.",
  },
  {
    q: "Hoeveel uur kan ik per jaar factureren?",
    a: "Bij 40 uur per week, 5 weken vakantie en 10 vrije dagen werk je zo'n 1.800 uur per jaar. Is driekwart daarvan declarabel, dan factureer je ongeveer 1.350 uur.",
  },
  {
    q: "Hoeveel belasting moet ik reserveren?",
    a: "Een veelgebruikte vuistregel is 30 tot 40% van je winst. Door de zelfstandigenaftrek, de MKB-winstvrijstelling en de heffingskortingen ligt het echte bedrag vaak lager. Laat het bij twijfel narekenen door een boekhouder.",
  },
  {
    q: "Wat is het urencriterium?",
    a: "Je moet minstens 1.225 uur per jaar aan je onderneming besteden om in aanmerking te komen voor de zelfstandigenaftrek. Ook uren die je niet factureert, zoals administratie en klanten zoeken, tellen mee.",
  },
  {
    q: "Moet ik btw bovenop mijn uurtarief rekenen?",
    a: "Meestal wel: 21% bovenop je tarief, die je afdraagt aan de Belastingdienst. Gebruik je de kleineondernemersregeling (KOR), dan reken je geen btw. Deze rekentool rekent met tarieven zonder btw.",
  },
  {
    q: "Wat kost ZekerFlex mij als zzp'er?",
    a: "Niets. De opdrachtgever betaalt de platformkosten. ZekerFlex maakt je factuur automatisch en wachten op de gewone uitbetaling is gratis. Alleen als je sneller je geld wilt, betaal je daar een kleine fee voor.",
  },
];

export default function ZzpUurtariefPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            breadcrumbJsonLd([["Home", "/"], ["Rekentools", "/rekentools"], ["Zzp uurtarief berekenen", PATH]]),
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
            · voor zzp&apos;ers
          </p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">
            Welk uurtarief heb je nodig?
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Vul in wat je netto wilt overhouden. De rekentool telt vakantie, ziekte, pensioen, verzekering, kosten en
            belasting mee en laat zien welk tarief daarbij hoort.
          </p>
        </div>
      </div>

      <Section tone="soft">
        <ZzpUurtarief />
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Zo rekenen we" title="Van netto inkomen naar uurtarief" />
        <div className="mt-10 grid gap-x-10 gap-y-8 text-[0.975rem] leading-relaxed text-neutralx-600 md:grid-cols-2">
          <div>
            <h3 className="font-display text-xl font-semibold text-ink">1. Je werkuren</h3>
            <p className="mt-2">
              We nemen 52 weken, halen je vakantie eraf en daarna je feestdagen en ziektedagen. Van wat overblijft is
              alleen het declarabele deel factureerbaar. De rest heb je nodig voor offertes, administratie en bijscholing.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold text-ink">2. Je belasting</h3>
            <p className="mt-2">
              Over je winst na pensioen en AOV reserveren we het percentage dat je kiest. Pensioen (lijfrente) en
              AOV-premie zijn meestal aftrekbaar, daarom gaan ze er vóór de belasting af.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold text-ink">3. Je omzet</h3>
            <p className="mt-2">
              Netto + belasting + pensioen + AOV + zakelijke kosten is de omzet die je per jaar nodig hebt. Gedeeld door
              je declarabele uren is dat je minimale uurtarief.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold text-ink">4. Je marge</h3>
            <p className="mt-2">
              Dit is een ondergrens. Reken er iets bovenop voor stille maanden, een buffer en groei. Twijfel je over je
              belasting, laat je cijfers dan narekenen door een boekhouder. Vergelijk daarna met de{" "}
              <Link href="/klussen" className="text-brand-600 underline">
                open klussen
              </Link>{" "}
              en wat daar geboden wordt.
            </p>
          </div>
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Over je uurtarief" />
        <div className="mt-10">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand
        title="Klussen tegen jouw tarief"
        body="Maak gratis je profiel, kies je eigen klussen en ontvang je geld zonder zelf facturen te sturen."
        primaryLabel="Profiel aanmaken"
        secondaryHref="/klussen"
        secondaryLabel="Open klussen"
      />
    </>
  );
}
