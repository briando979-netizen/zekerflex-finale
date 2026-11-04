import type { Metadata } from "next";
import { Section, SectionHead } from "@/components/marketing/primitives";
import { ReviewScan } from "@/components/reviews/ReviewScan";
import { canonical } from "@/lib/seo";
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
  return (
    <Section>
      <SectionHead eyebrow="Gratis review-check" title="Hoe scoort je bedrijf op Google?" intro={DESCRIPTION} />
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
      <p className="mt-8 max-w-4xl text-xs text-neutralx-500">
        We gebruiken alleen openbare gegevens van Google en je website. Namen van reviewers bewaren we niet. Vraag alle klanten om een review, niet alleen de tevreden: alleen tevreden klanten vragen mag volgens Google niet, en reviews kopen is misleiding.
      </p>
    </Section>
  );
}
