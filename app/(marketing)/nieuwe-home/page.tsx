import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ldJson } from "@/lib/seo/json-ld";
import { Reveal } from "@/components/marketing/Reveal";
import { FaqList } from "@/components/marketing/primitives";
import { AppDownload } from "@/components/marketing/AppDownload";
import { PaginaVideoBlok } from "@/components/marketing/PaginaVideoBlok";
import { HomeZoekBalk } from "@/components/marketing/HomeZoekBalk";
import { HOME_FAQ, HOME_TEGELS, HOME_WERELDEN, homeFaqJsonLd, type HomeIcoon } from "@/lib/marketing/home-breed";
import { VOORBEELDEN } from "@/lib/website/aanvraag-opties";

// ---------------------------------------------------------------------------
// VOORBEELD (19 nov 2026): de nieuwe, brede voorpagina — "wat ZekerFlex voor je
// doet / wat wij bouwen / wat jij kunt doen". Een frisse, conversationele
// instap (HomeZoekBalk) en een verzorgd overzicht van alles: flexwerk/uitzenden,
// websites, webshops, apps, branchesoftware en AI. De oude flexwerker-voorpagina
// staat nu op /flexwerk; deze pagina linkt er prominent naartoe.
//
// Dit is bewust een voorbeeldroute (de echte voorpagina blijft /). Daarom
// noindex: zo vraagt de eigenaar hem eerst op /nieuwe-home voordat de
// hoofdsessie hem omwisselt. Teksten: lib/marketing/home-breed.ts.
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Wat kan ZekerFlex voor je doen? | ZekerFlex",
  description:
    "Mensen vinden of inhuren, een website of webshop laten bouwen, een app of branchesoftware: ZekerFlex doet het onder één dak. Typ wat je zoekt en we wijzen je de weg.",
  robots: { index: false, follow: true },
};

export const revalidate = 60;

export default function NieuweHomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(homeFaqJsonLd()) }}
      />

      {/* ───────────────────────────────────────────────── hero: de conversationele instap */}
      <section className="relative isolate overflow-hidden hero-ink text-white">
        <div className="aurora" aria-hidden />
        <div className="shell-4k relative py-14 text-center md:py-20 lg:py-24">
          <Reveal className="mx-auto max-w-3xl">
            <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-xs font-semibold text-white/80 backdrop-blur">
              <span className="live-dot" aria-hidden /> Eén platform, alles onder één dak
            </p>
            <h1 className="fluid-hero mx-auto mt-5 max-w-3xl text-balance font-display font-bold">
              Wat kan ZekerFlex{" "}
              <span className="bg-gradient-to-r from-brand-mint to-[#8FF0C4] bg-clip-text text-transparent">voor je doen?</span>
            </h1>
            <p className="fluid-lead mx-auto mt-4 max-w-2xl text-white/75">
              Mensen vinden of inhuren, een website of webshop laten bouwen, een app of software voor jouw zaak. Typ wat je
              zoekt, of kies een knop — we brengen je meteen op de juiste plek.
            </p>
          </Reveal>

          {/* de zoekbalk zelf is client (navigeert op wat je typt) */}
          <HomeZoekBalk />
        </div>

        {/* schuivende strook met wat we doen (alleen CSS; staat stil bij "minder beweging") */}
        <div className="relative border-t border-white/10 py-3">
          <ul className="marquee gap-3 pr-3" aria-hidden>
            {[0, 1, 2, 3].map((ronde) =>
              CAPACITEITEN.map((c) => (
                <li key={`${ronde}-${c}`}>
                  <span className="inline-block whitespace-nowrap rounded-full border border-white/12 px-4 py-1.5 font-display text-sm font-semibold text-white/70">
                    {c}
                  </span>
                </li>
              )),
            )}
          </ul>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── wat wij voor je doen */}
      <section className="bg-paper">
        <div className="shell-4k py-10 md:py-12 lg:py-16">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Wat wij kunnen</p>
            <h2 className="fluid-h2 mt-3 text-balance font-display font-bold">Alles wat je nodig hebt om te werken en te groeien</h2>
            <p className="fluid-lead mt-4 text-neutralx-600">
              Van personeel tot je hele online aanwezigheid. Je zet aan wat je nodig hebt en laat de rest uit.
            </p>
          </Reveal>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {HOME_TEGELS.map((t, i) => (
              <Reveal
                key={t.titel}
                as="li"
                delay={i * 70}
                className="group surface surface-hover relative flex flex-col p-5 md:p-6"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Icoon naam={t.icoon} />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                  <Link href={t.href} className="after:absolute after:inset-0 after:content-[''] focus:outline-none">
                    {t.titel}
                  </Link>
                </h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-neutralx-600">{t.tekst}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                  Bekijk
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                </span>
                {t.sub ? (
                  <Link
                    href={t.sub.href}
                    className="relative z-10 mt-3 inline-flex w-fit items-center gap-1 border-t border-hair pt-3 text-xs font-semibold text-neutralx-500 transition hover:text-brand-600"
                  >
                    {t.sub.label} →
                  </Link>
                ) : null}
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── wat wij bouwen (echte sites en apps) */}
      <section className="bg-paper-soft">
        <div className="shell-4k py-10 md:py-12 lg:py-16">
          <Reveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="eyebrow">Wat wij bouwen</p>
              <h2 className="fluid-h2 mt-3 text-balance font-display font-bold">Dit maakten we al</h2>
              <p className="fluid-lead mt-4 text-neutralx-600">
                Echte websites en apps die we zelf bouwden en die nu live staan. Jouw project kan hier ook tussen staan.
              </p>
            </div>
            <Link href="/website-maken#voorbeelden" className="btn-primary flex-shrink-0">
              Bekijk de voorbeelden
            </Link>
          </Reveal>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VOORBEELDEN.map((v, i) => (
              <Reveal
                key={v.id}
                as="li"
                delay={i * 70}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-hair bg-white shadow-e1 transition-all duration-300 hover:-translate-y-1 hover:shadow-e3"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-ink">
                  <Image
                    src={v.foto}
                    alt={`Een scherm van ${v.naam}, door ZekerFlex gebouwd`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="eyebrow text-brand-500">{v.soort}</p>
                  <h3 className="mt-1.5 font-display text-lg font-semibold text-ink">
                    <Link href="/website-maken#voorbeelden" className="after:absolute after:inset-0 after:content-[''] focus:outline-none">
                      {v.naam}
                    </Link>
                  </h3>
                  <p className="mt-1 flex-1 text-sm leading-relaxed text-neutralx-600">{v.tekst}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── twee werelden */}
      <section className="bg-paper">
        <div className="shell-4k py-10 md:py-12 lg:py-16">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Voor wie</p>
            <h2 className="fluid-h2 mt-3 text-balance font-display font-bold">Of je nu werk zoekt of mensen</h2>
          </Reveal>

          <div className="mt-8 grid gap-4 md:grid-cols-2 md:gap-6">
            {HOME_WERELDEN.map((w, i) => (
              <Reveal
                key={w.kant}
                delay={i * 90}
                className="group flex flex-col overflow-hidden rounded-3xl border border-hair bg-ink text-white shadow-e2"
              >
                <div className="relative aspect-[16/9] overflow-hidden sm:aspect-[2/1]">
                  <Image
                    src={w.foto}
                    alt={w.alt}
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover object-[50%_25%] transition-transform duration-700 group-hover:scale-105"
                  />
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0C0E12] via-transparent to-transparent" />
                </div>
                <div className="flex flex-1 flex-col p-6 md:p-8">
                  <p className="eyebrow text-brand-mint">{w.eyebrow}</p>
                  <h3 className="mt-2 font-display text-2xl font-bold">{w.titel}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-white/80">{w.tekst}</p>
                  <div className="mt-5">
                    <Link href={w.href} className="btn-mint text-base">
                      {w.knop}
                    </Link>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── uitlegvideo */}
      <PaginaVideoBlok id="home" />

      {/* ───────────────────────────────────────────────── de app */}
      <AppDownload />

      {/* ───────────────────────────────────────────────── vragen */}
      <section className="bg-paper">
        <div className="shell-4k grid gap-6 py-10 md:py-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12 lg:py-16">
          <Reveal>
            <p className="eyebrow">Veelgestelde vragen</p>
            <h2 className="fluid-h2 mt-3 font-display font-bold">Goed om te weten</h2>
          </Reveal>
          <Reveal delay={120}>
            <FaqList items={HOME_FAQ} />
          </Reveal>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── afsluiter */}
      <section className="relative isolate overflow-hidden hero-ink text-white">
        <div className="aurora" aria-hidden />
        <div className="shell-4k relative py-10 md:py-12 lg:py-16">
          <Reveal className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <h2 className="fluid-h2 text-balance font-display font-bold">Waar wil je mee beginnen?</h2>
              <p className="fluid-lead mt-3 text-white/70">
                Kies je kant, of bekijk eerst het hele aanbod. Rondkijken kan vaak zonder account.
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap gap-3">
              <Link href="/flexwerk" className="btn-mint text-base">Ik zoek werk</Link>
              <Link href="/voor-bedrijven" className="btn-ghost-invert text-base">Ik zoek personeel</Link>
              <Link href="/aanbod" className="btn-ghost-invert text-base">Het hele aanbod</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

/** De woorden in de schuivende strook onder de hero (decoratief). */
const CAPACITEITEN = [
  "Flexwerk",
  "Uitzenden",
  "Websites",
  "Webshops",
  "Apps & spelletjes",
  "Horecasoftware",
  "Rijschoolsoftware",
  "AI-beller",
  "Facturen uit je uren",
  "Logo & advertentie",
  "Domeinnaam",
] as const;

function Icoon({ naam }: { naam: HomeIcoon }) {
  const lijn = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" as const };
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      {naam === "mensen" ? (
        <>
          <circle cx="9" cy="8" r="3.2" {...lijn} />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.2a3 3 0 0 1 0 5.6M17 19a5.5 5.5 0 0 0-2.3-4.5" {...lijn} />
        </>
      ) : naam === "web" ? (
        <>
          <rect x="3" y="4.5" width="18" height="15" rx="2" {...lijn} />
          <path d="M3 8.5h18M6 6.4h.01M8.2 6.4h.01" {...lijn} />
        </>
      ) : naam === "winkel" ? (
        <>
          <path d="M4 7h16l-1 4.2A2 2 0 0 1 17 13H7a2 2 0 0 1-2-1.8L4 7Z" {...lijn} />
          <path d="M4 7 5 4h14l1 3M8.5 17.5h.01M15.5 17.5h.01M7 13l.6 4.5h8.8L17 13" {...lijn} />
        </>
      ) : naam === "app" ? (
        <>
          <rect x="7" y="2.5" width="10" height="19" rx="2.4" {...lijn} />
          <path d="M11 18.5h2" {...lijn} />
        </>
      ) : naam === "branche" ? (
        <>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" {...lijn} />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" {...lijn} />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" {...lijn} />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" {...lijn} />
        </>
      ) : (
        <>
          <path d="M12 3l1.9 4.2L18 9l-4.1 1.8L12 15l-1.9-4.2L6 9l4.1-1.8L12 3Z" {...lijn} />
          <path d="M18.5 15l.7 1.6 1.8.7-1.8.7-.7 1.6-.7-1.6-1.8-.7 1.8-.7.7-1.6Z" {...lijn} />
        </>
      )}
    </svg>
  );
}
