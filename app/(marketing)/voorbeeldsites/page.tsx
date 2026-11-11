import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { BRANCHE_VOORBEELDEN } from "@/lib/sites/branche-voorbeelden";
import { DEMO_SLUG } from "@/lib/sites/demo";
import { BURGER_SLUG } from "@/lib/sites/burger-voorbeeld";
import { webshopTemplate } from "@/lib/sites/webshop-templates";
import { WINKEL_VOORBEELDEN, winkelVoorbeeldKaartfoto } from "@/lib/sites/winkel-voorbeelden";

export const metadata: Metadata = {
  title: "Voorbeeldwebsites per branche",
  description:
    "Bekijk complete voorbeeldwebsites van ZekerFlex voor horeca, bouw, schoonmaak, transport, zorg, kappers, garages, zakelijke dienstverlening en winkels, en een complete voorbeeldwebshop per ontwerp. Met online reserveren, een webshop met winkelmand, een 3D-burger, afspraken, offertes, chat en meer.",
  ...canonical("/voorbeeldsites"),
};

// De voorbeeldsites per branche (lib/sites/branche-voorbeelden.ts) en Bakkerij Jansen
// met webshop (lib/sites/demo.ts) en Burgerbar Vuur met 3D-burger, menu als webshop en reserveren
// (lib/sites/burger-voorbeeld.ts), allemaal in de stijl van schwarzwald.zekerflex.com.
// De foto's op deze pagina zijn de branchefoto's van de klus-kaarten (public/shifts), of
// een eigen kaartfoto waar de klus-kaarten geen branche hebben (public/voorbeeldsites).
// Daaronder een complete voorbeeldwebshop per ontwerp van Webshop openen (lib/sites/winkel-voorbeelden.ts),
// met de openingsfoto van de winkel zelf als kaartfoto (app/(marketing)/voorbeeldsites/foto/[id]/route.ts).

const KAARTEN = [
  ...BRANCHE_VOORBEELDEN.map((v) => ({ slug: v.slug, label: v.label, naam: v.bedrijf.naam, tekst: v.omschrijving, foto: v.kaart ?? `/shifts/${v.id}.jpg` })),
  { slug: BURGER_SLUG, label: "Hamburgerzaak", naam: "Burgerbar Vuur", tekst: "Een burger in 3D die laag voor laag in elkaar valt terwijl je scrolt, het menu als webshop met winkelmand, en online een tafel reserveren.", foto: "/voorbeeldsites/burger.jpg" },
  { slug: DEMO_SLUG, label: "Winkel met webshop", naam: "Bakkerij Jansen", tekst: "Bakkerij met een webshop: zoeken en filteren, producten met foto en prijs, maten en smaken, een winkelmand, en bestellen om af te halen of te laten bezorgen.", foto: "/shifts/retail.jpg" },
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
            <a href="#webshops" className="btn-ghost-invert px-6 py-3">
              Bekijk de voorbeeldwebshops
            </a>
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
          <p className="mt-8 text-sm text-neutralx-500">De bedrijven op deze voorbeeldsites bestaan niet. Je kunt alles proberen, ook reserveren en bestellen, maar er wordt niets bewaard of verstuurd. De foto&apos;s op de voorbeeldsites komen van Pexels.</p>
        </div>
      </section>

      <section className="bg-white" aria-labelledby="webshops">
        <div className="shell py-14 md:py-20">
          <h2 id="webshops" className="scroll-mt-24 font-display text-3xl font-bold text-ink md:text-4xl">
            Voorbeeldwebshops
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-neutralx-600">
            Voor elk ontwerp van Webshop openen een complete winkel: producten met maten en kleuren, aanbiedingen, iets wat uitverkocht is, verzenden, een kortingscode en de pagina&apos;s die elke webwinkel nodig heeft. Probeer het bestellen gerust tot het einde.
          </p>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {WINKEL_VOORBEELDEN.map((v) => (
              <li key={v.slug} className="surface flex flex-col overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- de foto komt van de voorbeeldwinkel zelf (een route, geen bestand in public) */}
                <img src={winkelVoorbeeldKaartfoto(v.id)} alt="" width={900} height={600} loading="lazy" decoding="async" className="aspect-[3/2] w-full object-cover" />
                <div className="flex flex-1 flex-col p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Ontwerp: {webshopTemplate(v.id).naam}</p>
                  <h3 className="mt-1 font-display text-xl font-bold text-ink">{v.bedrijf.naam}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-neutralx-600">{v.omschrijving}</p>
                  <p className="mt-4">
                    <a href={`/site/${v.slug}`} className="btn-primary">
                      Bekijk de webshop<span className="sr-only">: {v.bedrijf.naam}</span>
                    </a>
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-neutralx-500">Deze winkels bestaan niet. Je kunt alles proberen, ook een kortingscode en afrekenen, maar er wordt niets besteld, bewaard of verstuurd. De foto&apos;s komen van Pexels.</p>
        </div>
      </section>
    </>
  );
}
