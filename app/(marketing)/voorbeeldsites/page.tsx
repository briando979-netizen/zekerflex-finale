import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { BRANCHE_VOORBEELDEN } from "@/lib/sites/branche-voorbeelden";
import { DEMO_SLUG } from "@/lib/sites/demo";

export const metadata: Metadata = {
  title: "Voorbeeldwebsites per branche",
  description:
    "Bekijk complete voorbeeldwebsites van ZekerFlex voor horeca, bouw, schoonmaak, transport, zorg, kappers, garages, zakelijke dienstverlening en winkels. Met reserveren, afspraken, offertes, chat en meer.",
  ...canonical("/voorbeeldsites"),
};

// De voorbeeldsites per branche (lib/sites/branche-voorbeelden.ts) en Bakkerij Jansen
// met webshop (lib/sites/demo.ts), allemaal in de stijl van schwarzwald.zekerflex.com.
// De foto's op deze pagina zijn de branchefoto's van de klus-kaarten (public/shifts), of
// een eigen kaartfoto waar de klus-kaarten geen branche hebben (public/voorbeeldsites).

const KAARTEN = [
  ...BRANCHE_VOORBEELDEN.map((v) => ({ slug: v.slug, label: v.label, naam: v.bedrijf.naam, tekst: v.omschrijving, foto: v.kaart ?? `/shifts/${v.id}.jpg` })),
  { slug: DEMO_SLUG, label: "Winkel met webshop", naam: "Bakkerij Jansen", tekst: "Bakkerij met een webshop: producten met foto en prijs, maten en smaken, en bestellen om af te halen of te laten bezorgen.", foto: "/shifts/retail.jpg" },
];

export default function VoorbeeldsitesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbJsonLd([["Home", "/"], ["Voorbeeldwebsites", "/voorbeeldsites"]])) }}
      />
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <p className="eyebrow text-brand-mint">Websites van ZekerFlex</p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">Zo ziet jouw nieuwe website eruit</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/70">
            Een complete voorbeeldsite voor elke branche, met alles erop en eraan. Kies je branche en klik rond. Bovenaan elke site zie je wat hij allemaal kan.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/website-check" className="btn-mint px-6 py-3">
              Maak er gratis een van mijn site
            </Link>
          </div>
        </div>
      </div>

      <section className="bg-paper" aria-labelledby="branches">
        <div className="shell py-14 md:py-20">
          <h2 id="branches" className="font-display text-3xl font-bold text-ink md:text-4xl">
            Kies je branche
          </h2>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {KAARTEN.map((k) => (
              <li key={k.slug} className="surface flex flex-col overflow-hidden">
                <Image src={k.foto} alt="" width={1200} height={800} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="aspect-[3/2] w-full object-cover" />
                <div className="flex flex-1 flex-col p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">{k.label}</p>
                  <h3 className="mt-1 font-display text-xl font-bold text-ink">{k.naam}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-neutralx-600">{k.tekst}</p>
                  <p className="mt-4">
                    <a href={`/site/${k.slug}`} className="btn-primary">
                      Bekijk de site<span className="sr-only">: {k.naam}</span>
                    </a>
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-neutralx-500">De bedrijven op deze voorbeeldsites bestaan niet, en hun formulieren versturen niets. De foto&apos;s op de voorbeeldsites komen van Pexels.</p>
        </div>
      </section>
    </>
  );
}
