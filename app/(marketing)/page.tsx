import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ldJson } from "@/lib/seo/json-ld";
import { SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/ontwerp/seo-store";
import { env } from "@/lib/env";
import { Reveal } from "@/components/marketing/Reveal";
import { FaqList } from "@/components/marketing/primitives";
import { BranchShowcase } from "@/components/marketing/BranchShowcase";
import { AppDownload } from "@/components/marketing/AppDownload";
import { PaginaAchtergrond } from "@/components/shop/PaginaAchtergrond";
import {
  BEDRIJVEN_HOME,
  WERK_AANMELDEN,
  WERK_FAQ,
  WERK_GROEPEN,
  WERK_HERO,
  WERK_SLOT,
  WERK_STAPPEN,
  WERK_VOORDELEN,
  werkFaqJsonLd,
  type WerkIcoon,
} from "@/lib/marketing/werk-home";

// ---------------------------------------------------------------------------
// De homepagina voor werkzoekenden (11 nov 2026). Wie zekerflex.com opent, ziet
// deze; de homepagina voor bedrijven (de vorige home) staat op /bedrijven, met
// "Ik zoek personeel" bovenaan en de schakelaar in de kop. Compact, zoals de
// eigenaar de home wil: de kop, de knoppen en het eerste beeld in één scherm.
// Teksten: lib/marketing/werk-home.ts.
// ---------------------------------------------------------------------------

// titel en omschrijving: de standaard in lib/ontwerp/seo.ts, of een eigen versie uit de Site-ontwerper (SEO)
export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/", { keywords: [...SITE.keywords] });
}

// De gekozen achtergrond komt uit de opslag: zonder dit zou hij bij het bouwen worden vastgelegd (toen is er geen database).
export const revalidate = 60;

export default function WerkHomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(werkFaqJsonLd()) }}
      />
      <PaginaAchtergrond pagina="home" />

      {/* ───────────────────────────────────────────────── opening */}
      <section className="relative isolate overflow-hidden bg-[#0C0E12] text-white">
        {/* telefoon: de foto als vlak bovenaan, de tekst eronder op donker; groter scherm: de tekst links op donker, de foto als strook
            rechts (een staande foto: zo blijft het gezicht heel en dichtbij genoeg) */}
        <div className="absolute inset-x-0 top-0 -z-10 h-[22rem] md:inset-y-0 md:left-auto md:h-auto md:w-[40%]">
          <Image
            src={WERK_HERO.foto}
            alt={WERK_HERO.fotoAlt}
            fill
            priority
            sizes="(min-width: 768px) 40vw, 100vw"
            className="object-cover object-[50%_18%] md:object-[50%_28%]"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0C0E12] via-[#0C0E12]/30 via-40% to-transparent md:bg-gradient-to-r md:via-[#0C0E12]/40 md:via-25% md:to-50%" />
        </div>
        <div className="shell-4k relative pb-8 pt-[15rem] md:py-14 lg:py-16">
          <div className="max-w-xl md:max-w-sm lg:max-w-xl">
            <Link
              href={BEDRIJVEN_HOME}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/80 backdrop-blur transition hover:bg-white/15"
            >
              {WERK_HERO.wissel.vraag} <span className="text-brand-mint">{WERK_HERO.wissel.knop} →</span>
            </Link>
            <p className="eyebrow mt-5 text-brand-mint">{WERK_HERO.eyebrow}</p>
            <h1 className="fluid-hero mt-3 text-balance font-display font-bold">
              {WERK_HERO.kop}{" "}
              <span className="bg-gradient-to-r from-brand-mint to-[#8FF0C4] bg-clip-text text-transparent">{WERK_HERO.kopAccent}</span>
            </h1>
            <p className="fluid-lead mt-4 max-w-lg text-white/75">{WERK_HERO.lead}</p>
            <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
              <Link href={WERK_AANMELDEN} className="btn-mint text-base">
                {WERK_HERO.knop}
              </Link>
              <Link href="/klussen" className="btn-ghost-invert text-base">
                {WERK_HERO.knop2}
              </Link>
            </div>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-white/70">
              {WERK_HERO.punten.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <Vink />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── voor wie */}
      <section className="bg-paper">
        <div className="shell-4k py-8 md:py-10 lg:py-12">
          <Reveal>
            <p className="eyebrow">Voor wie</p>
            <h2 className="fluid-h2 mt-3 text-balance font-display font-bold">Werk dat past bij jouw leven</h2>
          </Reveal>
          <ul className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {WERK_GROEPEN.map((g, i) => (
              <Reveal key={g.titel} as="li" delay={i * 80} className="overflow-hidden rounded-2xl border border-hair bg-white">
                <div className="relative aspect-[4/3]">
                  <Image src={g.foto} alt={g.alt} fill sizes="(max-width: 1024px) 50vw, 25vw" className="object-cover" />
                </div>
                <div className="p-3 md:p-4">
                  <h3 className="font-display text-base font-semibold md:text-lg">{g.titel}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{g.tekst}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── zo werkt het */}
      <section id="hoe-het-werkt" className="relative isolate scroll-mt-24 overflow-hidden hero-ink text-white">
        <div className="aurora" aria-hidden />
        <div className="shell-4k relative py-8 md:py-10 lg:py-12">
          <Reveal>
            <p className="eyebrow text-brand-mint">Zo werkt het</p>
            <h2 className="fluid-h2 mt-3 text-balance font-display font-bold">In drie stappen aan het werk</h2>
          </Reveal>
          <ol className="mt-6 grid gap-3 md:grid-cols-3 md:gap-4">
            {WERK_STAPPEN.map((s, i) => (
              <Reveal key={s.titel} as="li" delay={i * 100} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur md:p-5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-mint font-display text-base font-bold text-ink">{i + 1}</span>
                <h3 className="mt-3 font-display text-lg font-semibold">{s.titel}</h3>
                <p className="mt-1 text-sm leading-relaxed text-white/70">{s.tekst}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── branches (met het minimumuurloon) */}
      <BranchShowcase minRateCents={env.MIN_SHIFT_RATE_CENTS} />

      {/* ───────────────────────────────────────────────── waarom */}
      <section className="bg-paper">
        <div className="shell-4k py-8 md:py-10 lg:py-12">
          <Reveal>
            <p className="eyebrow">Waarom ZekerFlex</p>
            <h2 className="fluid-h2 mt-3 text-balance font-display font-bold">Eerlijk werk, op jouw voorwaarden</h2>
          </Reveal>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            {WERK_VOORDELEN.map((v, i) => (
              <Reveal key={v.titel} as="li" delay={i * 80} className="rounded-2xl border border-hair bg-white p-4 md:p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Icoon naam={v.icoon} />
                </span>
                <h3 className="mt-3 font-display text-base font-semibold md:text-lg">{v.titel}</h3>
                <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{v.tekst}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── de app */}
      <AppDownload />

      {/* ───────────────────────────────────────────────── vragen */}
      <section className="bg-paper">
        <div className="shell-4k grid gap-6 py-8 md:py-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12 lg:py-12">
          <Reveal>
            <p className="eyebrow">Veelgestelde vragen</p>
            <h2 className="fluid-h2 mt-3 font-display font-bold">Goed om te weten</h2>
          </Reveal>
          <Reveal delay={120}>
            <FaqList items={WERK_FAQ} />
          </Reveal>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── afsluiter */}
      <section className="relative isolate overflow-hidden hero-ink text-white">
        <div className="aurora" aria-hidden />
        <div className="shell-4k relative py-8 md:py-10 lg:py-12">
          <Reveal className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <h2 className="fluid-h2 text-balance font-display font-bold">{WERK_SLOT.kop}</h2>
              <p className="fluid-lead mt-3 text-white/70">{WERK_SLOT.lead}</p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap gap-3">
              <Link href={WERK_AANMELDEN} className="btn-mint text-base">
                {WERK_HERO.knop}
              </Link>
              <Link href={BEDRIJVEN_HOME} className="btn-ghost-invert text-base">
                {WERK_HERO.wissel.knop}
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

function Vink() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="flex-shrink-0 text-brand-mint">
      <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Icoon({ naam }: { naam: WerkIcoon }) {
  const lijn = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      {naam === "geld" ? (
        <>
          <circle cx="12" cy="12" r="8" {...lijn} />
          <path d="M14.5 9.5a3 3 0 0 0-5 1.5c0 3 5 1.5 5 4.5a3 3 0 0 1-5 1M12 6.5v1.5M12 16v1.5" {...lijn} />
        </>
      ) : naam === "keuze" ? (
        <path d="M5 12l4 4 10-10" {...lijn} />
      ) : naam === "rekening" ? (
        <>
          <rect x="3" y="6" width="18" height="13" rx="2" {...lijn} />
          <path d="M3 10h18M7 15h4" {...lijn} />
        </>
      ) : (
        <path d="M5 5h14v10H9l-4 4V5Z" {...lijn} />
      )}
    </svg>
  );
}
