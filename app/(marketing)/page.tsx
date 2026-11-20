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
import { PaginaVideoBlok } from "@/components/marketing/PaginaVideoBlok";
import { KopClip } from "@/components/marketing/KopClip";
import { YoTabs } from "@/components/marketing/yo/YoTabs";
import { YO_KOP, YoCommunity, YoGenummerd, YoLink, YoPunten, YoSplit, YoStrook, YoVlakken } from "@/components/marketing/yo/YoDelen";
import {
  BEDRIJVEN_HOME,
  WERK_AANMELDEN,
  WERK_FAQ,
  WERK_GROEPEN,
  WERK_HERO,
  WERK_SLOT,
  WERK_STAPPEN,
  WERK_STROOK,
  WERK_VOORDELEN,
  werkFaqJsonLd,
} from "@/lib/marketing/werk-home";
import { YO_WERK } from "@/lib/marketing/yo-home";
import { isNietFlexwerkPad } from "@/lib/marketing/flexwerk-only";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";

// ---------------------------------------------------------------------------
// De homepagina voor werkzoekenden (11 nov 2026). Wie zekerflex.com opent, ziet
// deze; de homepagina voor bedrijven staat op /bedrijven, met "Ik zoek personeel"
// bovenaan en de schakelaar in de kop. Sinds 21 nov in de opzet van de website van
// YoungOnes (eigenaar: "dezelfde website-weergave, alleen onze eigen foto's"): witte
// kop met lichtlila vlakken en de videokaart rechts, foto + nachtblauw vlak, de
// genummerde lijst, tabbladen, de community en een fotostrook. Teksten:
// lib/marketing/werk-home.ts en lib/marketing/yo-home.ts.
// ---------------------------------------------------------------------------

// titel en omschrijving: de standaard in lib/ontwerp/seo.ts, of een eigen versie uit de Site-ontwerper (SEO)
export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/", { keywords: [...SITE.keywords] });
}

// De gekozen achtergrond komt uit de opslag: zonder dit zou hij bij het bouwen worden vastgelegd (toen is er geen database).
export const revalidate = 60;

export default async function WerkHomePage() {
  // vlag `publiek-alleen-flexwerk`: de voorpagina blijft, maar de knop "Bekijk klussen" en de "Bezorgen"-chip (→ /klussen,
  // nu verborgen) vallen weg; de bezoeker gaat via "Maak gratis je profiel" naar het aanmelden.
  const alleenFlexwerk = await alleenFlexwerkAan().catch(() => false);
  const strook = alleenFlexwerk ? WERK_STROOK.filter((s) => !isNietFlexwerkPad(s.href)) : WERK_STROOK;
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(werkFaqJsonLd()) }}
      />
      <PaginaAchtergrond pagina="home" />

      {/* ───────────────────────────────────────────────── opening: wit, lichtlila vlakken, de kop in kapitalen, rechts de videokaart */}
      <section className="relative isolate overflow-hidden bg-white text-yo-navy">
        <YoVlakken />
        <div className="shell-4k relative grid gap-10 py-10 md:grid-cols-[1.1fr_1fr] md:items-center md:py-16 lg:py-20">
          <div className="max-w-xl">
            <Link
              href={BEDRIJVEN_HOME}
              className="inline-flex items-center gap-2 rounded-full border border-yo-navy/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-yo-navy/80 transition hover:bg-yo-grey"
            >
              {WERK_HERO.wissel.vraag} <span className="text-yo-tealInk">{WERK_HERO.wissel.knop} →</span>
            </Link>
            <h1 className={`${YO_KOP} mt-6 text-5xl sm:text-6xl lg:text-7xl`}>{YO_WERK.kop}</h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-yo-navy/85">{WERK_HERO.lead}</p>
            <YoPunten punten={WERK_HERO.punten} />
            <div className="mt-7 flex flex-wrap gap-3">
              <YoLink href={WERK_AANMELDEN}>{WERK_HERO.knop}</YoLink>
              {alleenFlexwerk ? (
                <YoLink href="#hoe-het-werkt" omlijnd>{YO_WERK.knop2}</YoLink>
              ) : (
                <YoLink href="/klussen" omlijnd>{WERK_HERO.knop2}</YoLink>
              )}
            </div>
          </div>

          {/* rechts: de bewegende campagnefoto als grote kaart, met twee staande fotokaarten ernaast (zoals de videokaarten van YoungOnes) */}
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-3">
            <div className="relative aspect-[9/14] overflow-hidden rounded-lg bg-yo-grey">
              <Image
                src={WERK_HERO.foto}
                alt={WERK_HERO.fotoAlt}
                fill
                priority
                sizes="(min-width: 768px) 25vw, 50vw"
                className="object-cover object-[50%_18%]"
              />
              {/* dezelfde foto, bewegend: ligt er precies overheen. Laadt of speelt de video niet, dan zie je gewoon de foto. */}
              <KopClip src={WERK_HERO.video} className="absolute inset-0 h-full w-full object-cover object-[50%_18%]" />
              <span className="absolute bottom-3 left-3 rounded bg-yo-night/80 px-2 py-1 text-xs font-bold text-white">{YO_WERK.kaartLabel}</span>
            </div>
            {YO_WERK.kaarten.map((k) => (
              <div key={k.foto} className="relative aspect-[9/28] overflow-hidden rounded-lg bg-yo-grey">
                <Image src={k.foto} alt={k.alt} fill sizes="12vw" className="object-cover" />
                <span className="absolute bottom-4 left-1/2 origin-bottom-left -rotate-90 whitespace-nowrap font-display text-xs font-extrabold uppercase tracking-wider text-white drop-shadow">
                  {k.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── schuivende strook: de soorten werk (alleen CSS; staat stil bij "minder beweging") */}
      <nav aria-label="Soorten werk" className="overflow-hidden border-y border-white/10 bg-yo-navy py-3">
        <ul className="marquee gap-3 pr-3">
          {[0, 1, 2, 3].map((ronde) =>
            strook.map((s) => (
              <li key={`${ronde}-${s.naam}`} aria-hidden={ronde > 0 ? true : undefined}>
                <Link
                  href={s.href}
                  tabIndex={ronde > 0 ? -1 : undefined}
                  className="inline-block whitespace-nowrap rounded-full border border-white/15 px-4 py-1.5 font-display text-sm font-semibold uppercase text-white/85 transition hover:border-yo-teal hover:text-yo-teal"
                >
                  {s.naam}
                </Link>
              </li>
            )),
          )}
        </ul>
      </nav>

      {/* ───────────────────────────────────────────────── foto + nachtblauw vlak */}
      <YoSplit
        foto={YO_WERK.split.foto}
        alt={YO_WERK.split.alt}
        kop={YO_WERK.split.kop}
        tekst={YO_WERK.split.tekst}
        slot={YO_WERK.split.slot}
        knoppen={
          <>
            <YoLink href={WERK_AANMELDEN}>{WERK_HERO.knop}</YoLink>
            <YoLink href={YO_WERK.split.knop2.href} omlijnd wit>{YO_WERK.split.knop2.label}</YoLink>
          </>
        }
      />

      {/* ───────────────────────────────────────────────── werk, op jouw manier (genummerd) */}
      <YoGenummerd kop={YO_WERK.genummerd.kop} items={WERK_VOORDELEN} />

      <PaginaVideoBlok id="home" />

      {/* ───────────────────────────────────────────────── tabbladen: één plek voor al het werk / zzp / uitzend, met de chat */}
      <YoTabs tabs={YO_WERK.tabs.items} vragen={YO_WERK.tabs.vragen} />

      {/* ───────────────────────────────────────────────── zo werkt het */}
      <section id="hoe-het-werkt" className="scroll-mt-24 bg-yo-grey text-yo-navy">
        <div className="shell-4k py-12 md:py-16">
          <Reveal>
            <h2 className={`${YO_KOP} text-3xl md:text-4xl lg:text-5xl`}>In drie stappen aan het werk</h2>
          </Reveal>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {WERK_STAPPEN.map((s, i) => (
              <Reveal key={s.titel} as="li" delay={i * 100} className="rounded-lg bg-white p-5">
                <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full border-[3px] border-yo-red font-display text-xl font-extrabold italic text-yo-red">{i + 1}</span>
                <h3 className={`${YO_KOP} mt-4 text-lg`}>{s.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-yo-navy/80">{s.tekst}</p>
              </Reveal>
            ))}
          </ol>
          <Reveal delay={200} className="mt-8">
            <YoLink href={WERK_AANMELDEN}>{WERK_HERO.knop}</YoLink>
          </Reveal>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── branches (met het minimumuurloon) */}
      <BranchShowcase minRateCents={env.MIN_SHIFT_RATE_CENTS} />

      {/* ───────────────────────────────────────────────── ontmoet de werkers */}
      <YoCommunity
        kop={YO_WERK.community.kop}
        tekst={YO_WERK.community.tekst}
        knoppen={
          <>
            <YoLink href={WERK_AANMELDEN}>{WERK_HERO.knop}</YoLink>
            <YoLink href={YO_WERK.community.knop2.href} omlijnd>{YO_WERK.community.knop2.label}</YoLink>
          </>
        }
        kaarten={WERK_GROEPEN.map((g) => ({ kop: g.titel, tekst: g.tekst, foto: g.foto, alt: g.alt }))}
      />

      {/* ───────────────────────────────────────────────── fotostrook met de krabbel */}
      <YoStrook fotos={YO_WERK.strook.fotos} krabbel={YO_WERK.strook.krabbel} />

      {/* ───────────────────────────────────────────────── de app */}
      <AppDownload />

      {/* ───────────────────────────────────────────────── vragen */}
      <section id="vragen" className="scroll-mt-24 bg-white text-yo-navy">
        <div className="shell-4k grid gap-6 py-12 md:py-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
          <Reveal>
            <h2 className={`${YO_KOP} text-3xl md:text-4xl`}>Goed om te weten</h2>
          </Reveal>
          <Reveal delay={120}>
            <FaqList items={WERK_FAQ} />
          </Reveal>
        </div>
      </section>

      {/* ───────────────────────────────────────────────── afsluiter */}
      <section className="bg-yo-navy text-white">
        <div className="shell-4k py-12 md:py-16">
          <Reveal className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <h2 className={`${YO_KOP} text-3xl md:text-4xl lg:text-5xl`}>{WERK_SLOT.kop}</h2>
              <p className="mt-4 text-base leading-relaxed text-white/80">{WERK_SLOT.lead}</p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap gap-3">
              <YoLink href={WERK_AANMELDEN}>{WERK_HERO.knop}</YoLink>
              <YoLink href={BEDRIJVEN_HOME} omlijnd wit>{WERK_HERO.wissel.knop}</YoLink>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
