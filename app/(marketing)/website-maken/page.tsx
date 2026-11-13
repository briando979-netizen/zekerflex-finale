import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { galerijVoor } from "@/lib/sites/ontwerpen-server";
import { WEBSITE_PLANS } from "@/lib/website/manage";
import { accountStand } from "@/lib/billing/stripe-betalen";
import { OntwerpGalerij, type GalerijKaart } from "@/components/marketing/OntwerpGalerij";

export const metadata: Metadata = {
  title: "Maak zelf je website of webshop",
  description:
    "Kies een ontwerp, pas het aan door te slepen en te typen, en zet je website of webshop online. Bouwen en bekijken is gratis. Met producten, bestellingen, kortingscodes en een kassa erbij.",
  ...canonical("/website-maken"),
};

export const dynamic = "force-dynamic";

// /website-maken (13 nov 2026, eigenaar: "bied dit aan voor de klant, zoals de grote websitebouwers"): de ingang voor een
// bedrijf dat zelf een website of webshop wil maken in de Studio. Alles op deze pagina bestaat: de ontwerpen komen uit
// lib/sites/ontwerpen.ts, de prijs uit lib/website/manage.ts (bouwen en bekijken is gratis, online zetten vraagt een
// abonnement: lib/sites/access.ts). Een abonnement nemen kan alleen als het betaalaccount open staat (lib/billing/
// stripe-betalen.ts, dezelfde stand als de Webshop-console). Staat het dicht of is het niet gemeten, dan noemt de pagina geen
// prijs en belooft hij niet dat je nu online kunt: alleen wat nu echt kan, staat op de site. Geen verzonnen aantallen of klanten.

const BEGIN = "/register?type=bedrijf";

const STAPPEN = [
  { titel: "Kies een ontwerp of vertel je idee", tekst: "Begin met een ontwerp voor jouw branche, of typ in een zin wat je wilt maken. Wij zetten de eerste pagina's voor je klaar." },
  { titel: "Maak het van jou", tekst: "Verander teksten en foto's, sleep blokken naar een andere plek en kies je kleuren. Je ziet meteen hoe het wordt." },
];
// de derde stap hangt af van of online zetten nu kan
const STAP_ONLINE = { titel: "Zet hem online", tekst: "Tevreden? Zet je site online op je eigen adres. Tot dat moment kost het niets." };
const STAP_BINNENKORT = { titel: "Online zetten kan binnenkort", tekst: "Bouw je site nu alvast helemaal af en bekijk hem zoals een bezoeker hem ziet. Online zetten kan binnenkort." };

const KRIJGT = [
  { titel: "Een webshop die af is", tekst: "Producten met foto's, maten en kleuren, voorraad, een winkelmand en bestellen." },
  { titel: "Bestellingen en klanten", tekst: "Elke bestelling op een rij, met wie wat kocht. Kortingscodes en verzendkosten stel je zelf in." },
  { titel: "Een kassa voor in de winkel", tekst: "Reken ook aan de toonbank af; de voorraad loopt mee met je webshop." },
  { titel: "Reserveren en contact", tekst: "Een contactformulier op elke site, en online reserveren voor wie tafels of afspraken heeft." },
  { titel: "Je eigen domeinnaam", tekst: "Zoek en koppel je eigen adres. Het beveiligde slotje regelen wij." },
  { titel: "Zonder cookies of reclame", tekst: "Je site laadt snel en volgt je bezoekers niet. Alles staat bij ons op één plek." },
];

const euro = (cents: number) => `€ ${(cents / 100).toFixed(0)}`;

export default async function WebsiteMakenPage() {
  const [sites, shops] = await Promise.all([galerijVoor("website").catch(() => []), galerijVoor("webshop").catch(() => [])]);
  const kaarten: GalerijKaart[] = [
    ...sites.map((k) => ({ id: k.id, soort: "website" as const, naam: k.naam, omschrijving: k.omschrijving, categorie: k.categorie, foto: k.foto, voorbeeld: k.voorbeeld })),
    ...shops.map((k) => ({ id: k.id, soort: "webshop" as const, naam: k.naam, omschrijving: k.omschrijving, categorie: k.categorie, foto: k.foto, voorbeeld: k.voorbeeld })),
  ];
  const vanaf = euro(WEBSITE_PLANS.basis.priceCentsPerMonth);
  // alleen bij een gemeten, open betaalaccount; onbekend of een storing telt als dicht
  const kanOnline = (await accountStand().catch(() => null))?.betalen === true;
  const stappen = [...STAPPEN, kanOnline ? STAP_ONLINE : STAP_BINNENKORT];

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbJsonLd([["Home", "/"], ["Website maken", "/website-maken"]])) }}
      />
      <div className="hero-ink text-white">
        <div className="shell py-16 text-center md:py-24">
          <p className="eyebrow text-brand-mint">Websites en webshops van ZekerFlex</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">Maak zelf je website of webshop</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/70">Kies een ontwerp, pas het aan en zet het online. Je hoeft niets van techniek te weten.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={BEGIN} className="btn-mint px-6 py-3">
              Begin gratis
            </Link>
            <a href="#ontwerpen" className="btn-ghost-invert px-6 py-3">
              Bekijk de ontwerpen
            </a>
          </div>
          <p className="mt-5 text-sm text-white/60">{kanOnline ? `Bouwen en bekijken is gratis. Je betaalt pas als je hem online zet, vanaf ${vanaf} per maand.` : "Bouwen en bekijken is gratis. Online zetten kan binnenkort."}</p>
        </div>
      </div>

      <section className="bg-paper" aria-labelledby="ontwerpen">
        <div className="shell py-14 md:py-20">
          <h2 id="ontwerpen" className="font-display text-3xl font-bold text-ink md:text-4xl">
            Ontwerpen
          </h2>
          <p className="mt-2 max-w-2xl text-neutralx-600">Kies een ontwerp en maak het van jou. Elk ontwerp is een complete site, met pagina&apos;s en teksten die je zo aanpast.</p>
          <div className="mt-8">
            <OntwerpGalerij kaarten={kaarten} begin={BEGIN} />
          </div>
          <p className="mt-8 text-sm text-neutralx-600">
            Liever eerst rondklikken?{" "}
            <Link href="/voorbeeldsites" className="font-semibold text-brand-700 underline underline-offset-2">
              Bekijk de complete voorbeeldwebsites per branche
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="bg-white" aria-labelledby="zo-werkt-het">
        <div className="shell py-14 md:py-20">
          <h2 id="zo-werkt-het" className="font-display text-3xl font-bold text-ink md:text-4xl">
            Zo werkt het
          </h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {stappen.map((s, i) => (
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

      <section className="bg-paper" aria-labelledby="wat-je-krijgt">
        <div className="shell py-14 md:py-20">
          <h2 id="wat-je-krijgt" className="font-display text-3xl font-bold text-ink md:text-4xl">
            Wat je erbij krijgt
          </h2>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {KRIJGT.map((k) => (
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
            {kanOnline ? "Begin vandaag, betaal pas als hij online gaat" : "Begin vandaag met bouwen"}
          </h2>
          {kanOnline ? (
            <p className="mx-auto mt-4 max-w-2xl text-white/70">
              Maak een account voor je bedrijf en bouw je site in de Studio. Online zetten kan vanaf {vanaf} per maand.{" "}
              <Link href="/abonnementen" className="underline underline-offset-2">
                Bekijk de abonnementen
              </Link>
              .
            </p>
          ) : (
            <p className="mx-auto mt-4 max-w-2xl text-white/70">Maak een account voor je bedrijf en bouw je site in de Studio. Bouwen en bekijken is gratis. Online zetten kan binnenkort.</p>
          )}
          <p className="mt-8">
            <Link href={BEGIN} className="btn-mint px-6 py-3">
              Begin gratis
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
