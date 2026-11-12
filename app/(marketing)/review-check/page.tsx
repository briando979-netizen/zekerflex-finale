import type { Metadata } from "next";
import { FaqList, Section, SectionHead } from "@/components/marketing/primitives";
import { ReviewScan } from "@/components/reviews/ReviewScan";
import { breadcrumbJsonLd, canonical, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { getReviewScan } from "@/lib/review-scan/run";
import { getScanLog } from "@/lib/scans/store";

const TITLE = "Gratis review-check: hoe scoort je bedrijf op Google?";
const DESCRIPTION =
  "Plak je Google-link of website en zie binnen een halve minuut je reviewscore, hoe je het doet tegenover bedrijven in de buurt, wat klanten zeggen en wat je kunt verbeteren. Met een antwoordvoorstel per review.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ZekerFlex` },
  description: DESCRIPTION,
  keywords: ["google reviews verbeteren", "review check", "google bedrijfsprofiel", "meer google reviews", "reageren op reviews", "online reputatie"],
  ...canonical("/review-check", { title: TITLE, description: DESCRIPTION }),
};

export const dynamic = "force-dynamic";

// Feitelijk, en gelijk aan hoe de check werkt (lib/review-scan/model.ts scoreScan).
const FAQ = [
  {
    q: "Wat kost de review-check?",
    a: "Niets. De check is gratis en je hebt er geen account voor nodig. Je ziet het rapport meteen.",
  },
  {
    q: "Waar komen de gegevens vandaan?",
    a: "Uit je openbare Google-bedrijfsprofiel en je website. Namen van reviewers bewaren we niet.",
  },
  {
    q: "Hoe komt de score tot stand?",
    a: "De score van 0 tot 100 telt je beoordeling op Google, het aantal reviews, hoe recent de laatste reviews zijn, hoe compleet je bedrijfsprofiel is (telefoon, website, openingstijden, foto's) en, als die er zijn, hoe je het doet tegenover vergelijkbare bedrijven in de buurt.",
  },
  {
    q: "Hoe krijg ik meer Google-reviews?",
    a: "Vraag het direct na het bezoek of de afspraak, met een persoonlijke link die meteen naar je Google-profiel gaat. Hoe makkelijker het is, hoe vaker klanten het doen. Reageer ook op reviews: dat laat zien dat je luistert.",
  },
  {
    q: "Mag ik alleen tevreden klanten om een review vragen?",
    a: "Nee. Alleen tevreden klanten vragen mag volgens de regels van Google niet, en reviews kopen of laten schrijven is misleiding. Vraag iedere klant; een eerlijke score met veel reviews overtuigt het meest.",
  },
  {
    q: "Moet ik reageren op een negatieve review?",
    a: "Ja, rustig en zakelijk en liefst binnen een paar dagen. Bedank voor de feedback, ga in op het punt en bied aan het op te lossen. De check geeft per review een voorstel voor je antwoord dat je zelf kunt aanpassen.",
  },
];

const PUNTEN: [string, string][] = [
  ["Je reviewscore", "Beoordeling, aantal en actualiteit van je reviews, en hoe compleet je Google-profiel is, samen in één score van 0 tot 100."],
  ["Tegenover de buurt", "Hoe je het doet tegenover vergelijkbare bedrijven binnen 3 km, en hoeveel reviews je nodig hebt om ze in te halen."],
  ["Wat je kunt doen", "Verbetervoorstellen op volgorde van wat het meeste oplevert, en per review een voorstel voor je antwoord."],
];

export default async function ReviewCheckPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const initial = r ? await getReviewScan(r) : null;
  // het voorstel op maat bij deze scan, als die er is (lib/scans)
  const log = initial ? await getScanLog("reviews", initial.id) : null;
  const app = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Gratis review-check",
    description: DESCRIPTION,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Alle",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    provider: { "@type": "Organization", name: SITE.name, url: SITE.url },
    url: `${SITE.url}/review-check`,
  };
  return (
    <Section>
      {!initial && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: ldJson([app, breadcrumbJsonLd([["Home", "/"], ["Aanbod", "/aanbod"], ["Review-check", "/review-check"]])]) }}
        />
      )}
      <SectionHead kop="h1" eyebrow="Gratis review-check" title="Hoe scoort je bedrijf op Google?" intro={DESCRIPTION} />
      <div className="mt-8 max-w-4xl">
        <ReviewScan variant="openbaar" initial={initial} initialDealId={log?.dealId ?? null} />
      </div>
      {!initial && (
        <ul className="mt-10 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
          {PUNTEN.map(([t, b]) => (
            <li key={t} className="rounded-2xl border border-hair bg-white p-5">
              <p className="font-display font-bold text-ink">{t}</p>
              <p className="mt-2 text-sm text-neutralx-600">{b}</p>
            </li>
          ))}
        </ul>
      )}
      {!initial && (
        <div className="mt-14 max-w-3xl">
          <h2 className="font-display text-2xl font-bold text-ink md:text-3xl">Veelgestelde vragen</h2>
          <div className="mt-6">
            <FaqList items={FAQ} />
          </div>
        </div>
      )}
      <p className="mt-8 max-w-4xl text-xs text-neutralx-500">
        We gebruiken alleen openbare gegevens van Google en je website. Namen van reviewers bewaren we niet. Vraag alle klanten om een review, niet alleen de tevreden: alleen tevreden klanten vragen mag volgens Google niet, en reviews kopen is misleiding.
      </p>
    </Section>
  );
}
