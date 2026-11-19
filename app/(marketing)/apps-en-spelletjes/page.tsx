import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { APPS } from "@/lib/marketing/apps";
import { robotsVerborgen } from "@/lib/seo/verbergen";

const metaBasis: Metadata = {
  title: "Apps & spelletjes van ZekerFlex",
  description: "Ga direct naar de eigen apps van ZekerFlex: spelletjes, Talkaro, FlikFlak en de webshop. Gratis te gebruiken.",
  ...canonical("/apps-en-spelletjes"),
};
// vlag `publiek-alleen-flexwerk`: uit Google als de vlag aan is; de pagina blijft bereikbaar via een directe link
export async function generateMetadata(): Promise<Metadata> {
  return { ...metaBasis, ...(await robotsVerborgen("/apps-en-spelletjes")) };
}

// /apps-en-spelletjes (19 nov 2026, eigenaar): een aparte categorie in het menu, los van de voorbeelden op
// /website-maken, met grote knoppen "Ga naar …" naar de eigen apps (lib/marketing/apps.ts).
// Geen verzonnen aantallen; alles wat hier staat, staat echt live.

export default function AppsEnSpelletjesPagina() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbJsonLd([["Home", "/"], ["Apps & spelletjes", "/apps-en-spelletjes"]])) }} />

      <div className="hero-ink text-white">
        <div className="shell py-14 md:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Even iets anders</p>
          <h1 className="mt-2 font-display text-4xl font-bold md:text-5xl">Apps &amp; spelletjes</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/80">
            Naast werk bouwen we ook eigen apps. Ze zijn gratis, draaien op onze eigen servers in Nederland en je kunt er direct naartoe.
          </p>
        </div>
      </div>

      <section className="bg-paper" aria-labelledby="apps-kop">
        <div className="shell py-14 md:py-20">
          <h2 id="apps-kop" className="font-display text-3xl font-bold text-ink md:text-4xl">
            Kies waar je heen wilt
          </h2>
          <ul className="mt-8 grid gap-6 md:grid-cols-2">
            {APPS.map((a) => (
              <li key={a.sleutel} className="surface flex flex-col gap-4 p-6">
                <div className="flex items-center gap-4">
                  <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-3xl">
                    {a.icoon}
                  </span>
                  <div>
                    <h3 className="font-display text-2xl font-bold text-ink">{a.naam}</h3>
                    <p className="text-sm text-neutralx-600">{a.extern ? a.href.replace(/^https:\/\//, "") : "zekerflex.com" + a.href}</p>
                  </div>
                </div>
                <p className="text-neutralx-700">{a.tekst}</p>
                {a.extern ? (
                  <a href={a.href} target="_blank" rel="noopener noreferrer" className="btn-primary mt-auto inline-flex justify-center px-6 py-3">
                    {a.knop}
                    <span className="sr-only"> (opent in een nieuw tabblad)</span>
                  </a>
                ) : (
                  <Link href={a.href} className="btn-primary mt-auto inline-flex justify-center px-6 py-3">
                    {a.knop}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-neutralx-600">
            Wil je zelf zo&apos;n app of website?{" "}
            <Link href="/website-maken" className="font-semibold text-brand-700 underline underline-offset-2">
              Vertel ons je wensen
            </Link>
            , dan krijg je binnen een dag een voorbeeld.
          </p>
        </div>
      </section>
    </main>
  );
}
