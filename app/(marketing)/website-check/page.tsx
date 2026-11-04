import type { Metadata } from "next";
import { WebsiteCheck, type PlanCard } from "@/components/marketing/WebsiteCheck";
import { getWebsiteCheck } from "@/lib/website-check/run";
import { getScanLog } from "@/lib/scans/store";
import { WEBSITE_PLANS } from "@/lib/website/manage";
import { euro } from "@/lib/admin/format";
import { FaqList } from "@/components/marketing/primitives";
import { breadcrumbJsonLd, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

const DESCRIPTION =
  "Check gratis hoe snel, vindbaar in Google en veilig je website is. Binnen een halve minuut een rapport in gewone taal, met wat je kunt verbeteren.";

export const metadata: Metadata = {
  title: "Gratis website-check",
  description: DESCRIPTION,
  alternates: { canonical: "/website-check" },
};

export const dynamic = "force-dynamic";

const PLANS: PlanCard[] = (["basis", "pro"] as const).map((key) => ({
  key,
  label: WEBSITE_PLANS[key].label,
  price: euro(WEBSITE_PLANS[key].priceCentsPerMonth),
  blurb: WEBSITE_PLANS[key].blurb,
  features: WEBSITE_PLANS[key].features,
}));

// Feitelijk, en gelijk aan wat de check meet (lib/website-check/analyze.ts CATEGORY_LABEL).
const FAQ = [
  {
    q: "Wat kost de website-check?",
    a: "Niets. De check is gratis en je hebt er geen account voor nodig. Binnen een halve minuut zie je het rapport.",
  },
  {
    q: "Wat controleert de check?",
    a: "Vijf onderdelen: snelheid, hoe je site op een telefoon werkt, vindbaarheid in Google, veiligheid en wat bezoekers tegenkomen (kunnen ze je direct bereiken, werken alle links). Per punt staat erbij wat je eraan kunt doen.",
  },
  {
    q: "Verandert de check iets aan mijn website?",
    a: "Nee. We bekijken alleen de openbare pagina's, net als een bezoeker of Google. Er wordt niets aangepast of ingelogd.",
  },
  {
    q: "Wat is de nieuwe website die ik kan laten maken?",
    a: "Met één klik maken we van je eigen teksten, foto's en logo een voorbeeld van een nieuwe, snelle website. Die kun je bekijken zonder verplichting. Wil je hem echt, dan laat je je gegevens achter en nemen we contact met je op.",
  },
  {
    q: "Mijn score is laag. Wat nu?",
    a: "Begin bij de punten die als probleem gemarkeerd staan: die kosten je de meeste bezoekers. Veel ervan kan je eigen webbouwer oplossen. Wil je het liever laten regelen, dan staat er onder het rapport een voorstel op maat.",
  },
];

export default async function WebsiteCheckPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const initial = r ? await getWebsiteCheck(r) : null;
  // het voorstel op maat bij deze check, als die er is (lib/scans)
  const log = initial ? await getScanLog("website", initial.id) : null;
  const app = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Gratis website-check",
    description: DESCRIPTION,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Alle",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    provider: { "@type": "Organization", name: SITE.name, url: SITE.url },
    url: `${SITE.url}/website-check`,
  };
  return (
    <>
      {!initial && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: ldJson([app, breadcrumbJsonLd([["Home", "/"], ["Aanbod", "/aanbod"], ["Website-check", "/website-check"]])]) }}
        />
      )}
      <WebsiteCheck initial={initial} plans={PLANS} initialDealId={log?.dealId ?? null} />
      {!initial && (
        <section className="border-t border-hair bg-white" aria-labelledby="wc-faq-kop">
          <div className="shell py-14 md:py-20">
            <h2 id="wc-faq-kop" className="font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
              Veelgestelde vragen
            </h2>
            <div className="mt-8 max-w-3xl">
              <FaqList items={FAQ} />
            </div>
          </div>
        </section>
      )}
    </>
  );
}
