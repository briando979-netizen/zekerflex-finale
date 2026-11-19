import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ldJson } from "@/lib/seo/json-ld";
import { Reveal } from "@/components/marketing/Reveal";
import { FaqList } from "@/components/marketing/primitives";
import { AppDownload } from "@/components/marketing/AppDownload";
import { PaginaVideoBlok } from "@/components/marketing/PaginaVideoBlok";
import { HomeZoekBalk } from "@/components/marketing/HomeZoekBalk";
import { HOME_DEUREN, HOME_FAQ, homeFaqJsonLd, type DeurIcoon } from "@/lib/marketing/home-breed";
import { VOORBEELDEN } from "@/lib/website/aanvraag-opties";
import { APPS } from "@/lib/marketing/apps";

// ---------------------------------------------------------------------------
// VOORBEELD (19 nov 2026): de nieuwe voorpagina — één merk, één dak. Boven de
// vouw één dekkende zin, een échte antwoordende chat-gids en vier grote deuren
// (werk, personeel, online, branche). Daaronder het bewijs (echte sites die we
// bouwden) en, apart, een klein blok eigen apps.
//
// Dit is bewust een voorbeeldroute (de echte voorpagina blijft /). Daarom
// noindex: de eigenaar bekijkt hem eerst op /nieuwe-home; de hoofdsessie punt
// hem daarna om. Teksten en routering: lib/marketing/home-breed.ts.
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Alles voor je bedrijf, onder één dak | ZekerFlex",
  description:
    "Personeel, je website en je klanten, software voor je branche en je geldzaken — ZekerFlex doet het onder één dak. Stel je vraag en de gids wijst je de weg.",
  robots: { index: false, follow: true },
};

export const revalidate = 60;

// De twee echte sites die we zelf bouwden en die nu live staan (het bewijs).
const BEWIJS = VOORBEELDEN.filter((v) => v.id === "smileyapp" || v.id === "schwarzwald");
// Het aparte "even iets anders"-blok: de eigen apps, met hun eigen adres.
const IETS_ANDERS = ["flikflak", "talkaro", "webshop"]
  .map((s) => APPS.find((a) => a.sleutel === s))
  .filter((a): a is (typeof APPS)[number] => Boolean(a));

export default function NieuweHomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(homeFaqJsonLd()) }}
      />

      {/* ───────────────────────────────────────────────── hero: dekkende zin + antwoordende gids + vier deuren */}
      <section className="relative isolate overflow-hidden hero-ink text-white">
        <div className="aurora" aria-hidden />
        {/* een zachte, gerichte gloed achter de zoekbalk — diepte, geen kermis (staat vanzelf stil, puur CSS) */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[34%] -z-10 h-[30rem] w-[42rem] max-w-[90vw] -translate-x-1/2 rounded-full bg-brand-mint/10 blur-[130px]"
        />
        <div className="shell-4k relative py-12 text-center md:py-16 lg:py-20">
          <Reveal className="mx-auto max-w-3xl">
            <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-xs font-semibold text-white/80 backdrop-blur">
              <span className="live-dot" aria-hidden /> Eén platform, alles onder één dak
            </p>
            <h1 className="fluid-hero mx-auto mt-6 max-w-3xl text-balance font-display font-bold tracking-tight">
              Alles voor je bedrijf,{" "}
              <span className="bg-gradient-to-r from-brand-mint to-[#8FF0C4] bg-clip-text text-transparent">onder één dak</span>
            </h1>
            <p className="fluid-lead mx-auto mt-5 max-w-2xl text-pretty text-white/75">
              Personeel, je website en je klanten, software voor je branche en je geldzaken. Stel je vraag — de gids
              antwoordt en brengt je meteen op de juiste plek.
            </p>
          </Reveal>

          {/* de zoekbalk is een echte, antwoordende gids (client; praat met de openbare chat /api/chat) */}
          <HomeZoekBalk />

          {/* de vier grote deuren: het hoofdelement, boven de vouw, ook op mobiel */}
          <ul className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-3 text-left lg:grid-cols-4 lg:gap-4">
            {HOME_DEUREN.map((d, i) => (
              <Reveal as="li" key={d.href} delay={i * 70} className="h-full">
                <Link
                  href={d.href}
                  data-track={d.track}
                  aria-label={d.titel}
                  className={`group flex h-full flex-col rounded-2xl border bg-white/[0.05] p-4 backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-mint md:p-5 ${
                    d.nadruk ? "border-brand-mint/40 ring-1 ring-brand-mint/30 hover:border-brand-mint/70" : "border-white/12 hover:border-brand-mint/50"
                  }`}
                >
                  <span className={`grid h-11 w-11 place-items-center rounded-xl text-brand-mint transition-colors ${d.nadruk ? "bg-brand-mint/25" : "bg-brand-mint/15 group-hover:bg-brand-mint/25"}`}>
                    <DeurIcoonTeken naam={d.icoon} />
                  </span>
                  <span className="mt-3 block font-display text-base font-semibold leading-tight text-white md:text-lg">{d.titel}</span>
                  <p className="mt-1 flex-1 text-sm leading-snug text-white/65">{d.tekst}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-mint">
                    Open
                    <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── bewijs: dit maakten we al (echte sites) */}
      <section className="bg-paper">
        <div className="shell-4k py-12 md:py-14 lg:py-20">
          <Reveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="eyebrow">Dit maakten we</p>
              <h2 className="fluid-h2 mt-3 text-balance font-display font-bold">Echte sites die wij bouwden</h2>
              <p className="fluid-lead mt-4 text-neutralx-600">
                Geen voorbeeldplaatjes: dit staat nu live, op een eigen domein. Zo kan jouw site er ook uitzien.
              </p>
            </div>
            <Link href="/website-maken" className="btn-primary flex-shrink-0">
              Ook zo&apos;n site?
            </Link>
          </Reveal>

          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:gap-6">
            {BEWIJS.map((v, i) => (
              <Reveal
                key={v.id}
                as="li"
                delay={i * 90}
                className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-hair bg-white shadow-e1 transition-all duration-300 hover:-translate-y-1 hover:shadow-e3"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-ink">
                  <Image
                    src={v.foto}
                    alt={`Een scherm van ${v.naam}, door ZekerFlex gebouwd`}
                    fill
                    sizes="(max-width: 640px) 100vw, 50vw"
                    className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="flex flex-1 flex-col p-5 md:p-6">
                  <p className="eyebrow text-brand-500">{v.soort}</p>
                  <h3 className="mt-1.5 font-display text-xl font-semibold text-ink">
                    <a href={v.href} target="_blank" rel="noopener noreferrer" className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
                      {v.naam}
                    </a>
                  </h3>
                  <p className="mt-1 flex-1 text-sm leading-relaxed text-neutralx-600">{v.tekst}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                    Bekijk de site
                    <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
                  </span>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── uitlegvideo */}
      <PaginaVideoBlok id="home" />

      {/* ───────────────────────────────────────────────── de app */}
      <AppDownload />

      {/* ───────────────────────────────────────────────── vragen */}
      <section className="bg-paper">
        <div className="shell-4k grid gap-6 py-12 md:py-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12 lg:py-20">
          <Reveal>
            <p className="eyebrow">Veelgestelde vragen</p>
            <h2 className="fluid-h2 mt-3 font-display font-bold">Goed om te weten</h2>
          </Reveal>
          <Reveal delay={120}>
            <FaqList items={HOME_FAQ} />
          </Reveal>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── even iets anders: de eigen apps (apart van het zakelijke verhaal) */}
      <section className="bg-paper-soft">
        <div className="shell-4k py-10 md:py-12">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Even iets anders</p>
            <h2 className="fluid-h2 mt-3 font-display font-bold">Onze eigen apps</h2>
            <p className="fluid-lead mt-3 text-neutralx-600">
              Los van het zakelijke verhaal hierboven: drie eigen apps met hun eigen naam en adres.
            </p>
          </Reveal>

          <ul className="mt-7 grid gap-4 sm:grid-cols-3">
            {IETS_ANDERS.map((a, i) => (
              <Reveal
                key={a.sleutel}
                as="li"
                delay={i * 70}
                className="group relative flex flex-col rounded-2xl border border-hair bg-white p-5 shadow-e1 transition-all duration-300 hover:-translate-y-1 hover:shadow-e2"
              >
                <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-ink to-[#2A2E37] text-2xl shadow-e1">
                  {a.icoon}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold text-ink">
                  {a.extern ? (
                    <a href={a.href} target="_blank" rel="noopener noreferrer" className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
                      {a.naam}
                    </a>
                  ) : (
                    <Link href={a.href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
                      {a.naam}
                    </Link>
                  )}
                </h3>
                <p className="mt-1 flex-1 text-sm leading-relaxed text-neutralx-600">{a.tekst}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                  {a.knop}
                  <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
                </span>
                <span className="mt-2 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-neutralx-400">van ZekerFlex</span>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── afsluiter */}
      <section className="relative isolate overflow-hidden hero-ink text-white">
        <div className="aurora" aria-hidden />
        <div className="shell-4k relative py-12 md:py-14 lg:py-20">
          <Reveal className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <h2 className="fluid-h2 text-balance font-display font-bold">Waar wil je mee beginnen?</h2>
              <p className="fluid-lead mt-3 text-white/70">
                Kies je deur, of bekijk eerst het hele aanbod. Rondkijken kan vaak zonder account.
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap gap-3">
              <Link href="/flexwerk" data-track="home-slot-werk" className="btn-mint text-base">Ik zoek werk</Link>
              <Link href="/voor-bedrijven" data-track="home-slot-personeel" className="btn-ghost-invert text-base">Ik zoek personeel</Link>
              <Link href="/aanbod" data-track="home-slot-aanbod" className="btn-ghost-invert text-base">Het hele aanbod</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

/** De lijn-iconen van de vier deuren, in de huisstijl (24×24, lijn 1.8, ronde uiteinden). */
function DeurIcoonTeken({ naam }: { naam: DeurIcoon }) {
  const lijn = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" as const };
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      {naam === "werk" ? (
        // een koffer/toolbox: werk zoeken
        <>
          <rect x="3" y="7.5" width="18" height="12" rx="2" {...lijn} />
          <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3 12.5h18" {...lijn} />
        </>
      ) : naam === "personeel" ? (
        // twee mensen: personeel inhuren
        <>
          <circle cx="9" cy="8" r="3.2" {...lijn} />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.2a3 3 0 0 1 0 5.6M17 19a5.5 5.5 0 0 0-2.3-4.5" {...lijn} />
        </>
      ) : naam === "online" ? (
        // een wereldbol: online
        <>
          <circle cx="12" cy="12" r="8.5" {...lijn} />
          <path d="M3.5 12h17M12 3.5c2.5 2.3 2.5 14.7 0 17M12 3.5c-2.5 2.3-2.5 14.7 0 17" {...lijn} />
        </>
      ) : (
        // een raster: branchesoftware
        <>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" {...lijn} />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" {...lijn} />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" {...lijn} />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" {...lijn} />
        </>
      )}
    </svg>
  );
}
