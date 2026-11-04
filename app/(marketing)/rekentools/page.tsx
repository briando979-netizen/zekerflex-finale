import type { Metadata } from "next";
import Link from "next/link";
import { Section, CtaBand } from "@/components/marketing/primitives";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

export const metadata: Metadata = {
  title: "Gratis rekentools voor zzp'ers en werkgevers",
  description:
    "Bereken je zzp-uurtarief, zet de kosten van een uitzendkracht naast die van een zzp'er, of reken je platformkosten uit. Gratis, zonder account.",
  keywords: ["rekentool zzp", "uurtarief berekenen", "kosten uitzendkracht", "rekentools werkgever", "zzp calculator"],
  ...canonical("/rekentools", { fileImage: true }),
};

const TOOLS = [
  {
    href: "/rekentools/zzp-uurtarief-berekenen",
    who: "Voor zzp'ers",
    title: "Zzp uurtarief berekenen",
    body: "Welk tarief heb je nodig voor het netto inkomen dat je wilt? Of andersom: wat houd je over bij je huidige tarief?",
  },
  {
    href: "/rekentools/kosten-uitzendkracht-berekenen",
    who: "Voor bedrijven",
    title: "Kosten uitzendkracht of zzp'er",
    body: "Zet een uitzendbureau naast een zzp'er via ZekerFlex, per uur en voor de hele periode.",
  },
  {
    href: "/rekentools/wet-dba-check",
    who: "Voor opdrachtgevers en zzp'ers",
    title: "Wet DBA-check",
    body: "Tien vragen over hoe je samenwerkt. Zie waar het op loondienst lijkt en wat je eraan kunt doen.",
  },
  {
    href: "/prijzen#bedrijven",
    who: "Voor bedrijven",
    title: "Platformkosten per maand",
    body: "Hoeveel betaal je ZekerFlex bij jouw aantal uren, met de staffelkorting erin?",
  },
  {
    href: "/website-check",
    who: "Voor ondernemers",
    title: "Gratis website-check",
    body: "Hoe snel, vindbaar en veilig is je website? Binnen een halve minuut een rapport in gewone taal.",
  },
  {
    href: "/review-check",
    who: "Voor ondernemers",
    title: "Gratis review-check",
    body: "Hoe scoort je bedrijf op Google, naast de zaken bij jou in de buurt? Met verbeterpunten en voorbeeldantwoorden.",
  },
];

export default function RekentoolsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbJsonLd([["Home", "/"], ["Rekentools", "/rekentools"]])) }}
      />
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <p className="eyebrow text-brand-mint">Rekentools</p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">
            Reken het zelf uit
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Gratis en zonder account. Alles wordt in je eigen browser berekend; we bewaren niets van wat je invult.
          </p>
        </div>
      </div>

      <Section tone="paper">
        <ul className="grid gap-6 md:grid-cols-2">
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="card group flex h-full flex-col p-7 transition-shadow hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <span className="eyebrow">{t.who}</span>
                <span className="mt-3 font-display text-2xl font-semibold text-ink">{t.title}</span>
                <span className="mt-2 flex-1 text-[0.975rem] leading-relaxed text-neutralx-600">{t.body}</span>
                <span className="mt-5 text-sm font-semibold text-brand-600 group-hover:underline">Naar de rekentool →</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand
        title="Liever meteen aan de slag?"
        body="Een account maken is gratis. Als zzp'er betaal je niets, als bedrijf alleen voor gewerkte uren."
      />
    </>
  );
}
