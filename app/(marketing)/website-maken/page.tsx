import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { VOORBEELDEN, VOORBEELD_CATEGORIEEN } from "@/lib/website/aanvraag-opties";
import { WebsiteAanvraagFormulier } from "@/components/marketing/WebsiteAanvraagFormulier";
import { robotsVerborgen } from "@/lib/seo/verbergen";

const metaBasis: Metadata = {
  title: "Wij maken jouw website of app",
  description: "Vertel wat je wilt: kleuren, stijl, pagina's en wat de site moet kunnen. Binnen een dag krijg je een voorbeeld in drie versies.",
  ...canonical("/website-maken"),
};
// vlag `publiek-alleen-flexwerk`: uit Google als de vlag aan is; de pagina blijft bereikbaar via een directe link
export async function generateMetadata(): Promise<Metadata> {
  return { ...metaBasis, ...(await robotsVerborgen("/website-maken")) };
}

// /website-maken (opnieuw ingericht op 19 nov 2026, eigenaar): geen galerij met ontwerpen meer, maar een aanvraag. De klant
// kiest en vult zijn wensen in (kleur, stijl, video, logo, pagina's, functies, budget), de aanvraag komt als lead in
// Beheer → Sales en de eigenaar stuurt binnen een dag een voorbeeld in drie versies. Als voorbeeld staan er alleen de twee
// sites die we echt hebben gemaakt (lib/website/aanvraag-opties.ts): geen oude voorbeeldsites en geen webshopvoorbeeld.
// Geen verzonnen aantallen of klanten, en geen prijzen op de pagina zelf.

const ZELF = "/register?type=bedrijf";

const STAPPEN = [
  { titel: "Vertel wat je wilt", tekst: "Kies je kleuren, je stijl, de pagina's en wat de site moet kunnen. Aanvullen in je eigen woorden kan ook." },
  { titel: "Binnen een dag drie versies", tekst: "Wij maken een voorbeeld van jouw site in drie versies en sturen ze naar je mail. Je ziet het met je eigen naam en kleuren." },
  { titel: "Kies en wij maken hem af", tekst: "Kies de versie die het beste past en zeg wat anders moet. Daarna maken wij hem af en zetten we hem samen met je online." },
];

const KAN = [
  { titel: "Reserveren en afspraken", tekst: "Een agenda waarin je klanten zelf een dag en tijd kiezen." },
  { titel: "Een chat die antwoordt", tekst: "Een AI-assistent die vragen beantwoordt met de informatie van jouw site." },
  { titel: "Je eigen beheer", tekst: "Inloggen op een dashboard om aanvragen te zien en teksten en prijzen aan te passen." },
  { titel: "Ook als app", tekst: "Je site op het beginscherm van een telefoon, zoals een app." },
  { titel: "Meerdere talen", tekst: "Dezelfde site in het Nederlands, Engels of Duits." },
  { titel: "Video en beweging", tekst: "Met video's en kleine animaties die je site levendig maken." },
];

export default function WebsiteMakenPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbJsonLd([["Home", "/"], ["Website maken", "/website-maken"]])) }}
      />
      <div className="hero-ink text-white">
        <div className="shell py-16 text-center md:py-24">
          <p className="eyebrow text-brand-mint">Websites en apps van ZekerFlex</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">Wij maken jouw website of app</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/70">Vertel wat je wilt. Binnen een dag krijg je een voorbeeld in drie versies, met je eigen naam en kleuren.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#aanvraag" className="btn-mint px-6 py-3">
              Vertel je wensen
            </a>
            <a href="#voorbeelden" className="btn-ghost-invert px-6 py-3">
              Bekijk wat we maakten
            </a>
          </div>
          <p className="mt-5 text-sm text-white/60">Je zit nergens aan vast. Je krijgt eerst een voorbeeld te zien.</p>
        </div>
      </div>

      <section className="bg-paper" aria-labelledby="voorbeelden">
        <div className="shell py-14 md:py-20">
          <h2 id="voorbeelden" className="scroll-mt-24 font-display text-3xl font-bold text-ink md:text-4xl">
            Dit hebben we gemaakt
          </h2>
          <p className="mt-2 max-w-2xl text-neutralx-600">Websites, spelletjes en apps die we zelf hebben gebouwd. Klik erop en loop er doorheen: alles wat je ziet, werkt.</p>
          {VOORBEELD_CATEGORIEEN.map((categorie) => {
            const items = VOORBEELDEN.filter((v) => v.categorie === categorie);
            if (items.length === 0) return null;
            return (
              <div key={categorie} className="mt-10">
                <h3 className="font-display text-xl font-bold text-ink">{categorie}</h3>
                <ul className="mt-4 grid gap-6 md:grid-cols-3">
                  {items.map((v) => (
                    <li key={v.id} className="surface relative overflow-hidden">
                      <div className="relative aspect-[8/5] bg-paper-soft">
                        <Image src={v.foto} alt={`Een beeld van ${v.naam}`} fill sizes="(min-width: 768px) 30vw, 92vw" className="object-cover object-top" />
                      </div>
                      <div className="p-6">
                        <p className="text-sm font-semibold text-brand-700">{v.soort}</p>
                        <h4 className="mt-1 font-display text-2xl font-bold text-ink">{v.naam}</h4>
                        <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{v.tekst}</p>
                        <a href={v.href} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex font-semibold text-brand-700 underline underline-offset-2">
                          Bekijk {v.naam}
                          <span className="sr-only"> (opent in een nieuw tabblad)</span>
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white" aria-labelledby="zo-werkt-het">
        <div className="shell py-14 md:py-20">
          <h2 id="zo-werkt-het" className="font-display text-3xl font-bold text-ink md:text-4xl">
            Zo werkt het
          </h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {STAPPEN.map((s, i) => (
              <li key={s.titel} className="surface p-6">
                <p className="font-display text-3xl font-bold text-brand-700" aria-hidden>
                  {i + 1}
                </p>
                <h3 className="mt-2 font-display text-xl font-bold text-ink">{s.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{s.tekst}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-paper" aria-labelledby="aanvraag-kop">
        <div className="shell py-14 md:py-20">
          <h2 id="aanvraag-kop" className="font-display text-3xl font-bold text-ink md:text-4xl">
            Vertel je wensen
          </h2>
          <p className="mt-2 max-w-2xl text-neutralx-600">Kies wat bij je past en vul aan wat je mist. Hoe meer je vertelt, hoe beter het voorbeeld klopt.</p>
          <div id="aanvraag" className="mt-8 max-w-4xl scroll-mt-24">
            <WebsiteAanvraagFormulier />
          </div>
        </div>
      </section>

      <section className="bg-white" aria-labelledby="wat-kan">
        <div className="shell py-14 md:py-20">
          <h2 id="wat-kan" className="font-display text-3xl font-bold text-ink md:text-4xl">
            Wat je site kan
          </h2>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {KAN.map((k) => (
              <li key={k.titel} className="surface p-6">
                <h3 className="font-display text-lg font-bold text-ink">{k.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{k.tekst}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="hero-ink text-white" aria-labelledby="begin">
        <div className="shell py-14 text-center md:py-20">
          <h2 id="begin" className="font-display text-3xl font-bold md:text-4xl">
            Morgen jouw voorbeeld in drie versies
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/70">
            Vul je wensen in, dan gaan wij aan de slag. Liever zelf bouwen?{" "}
            <Link href={ZELF} className="underline underline-offset-2">
              Maak een account en bouw je site in de Studio
            </Link>
            .
          </p>
          <p className="mt-8">
            <a href="#aanvraag" className="btn-mint px-6 py-3">
              Vertel je wensen
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
