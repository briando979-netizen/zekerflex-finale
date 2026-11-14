import { Fragment, type ReactNode } from "react";
import { ldJson } from "@/lib/seo/json-ld";
import { getPrincipal, hasRole } from "@/lib/auth";
import { eigenSleutel, isSectie, zichtbareSecties, type HomeIndeling, type HomeItem, type HomeSectie } from "@/lib/ontwerp/home";
import { getConceptHomeIndeling, getLiveHomeIndeling } from "@/lib/ontwerp/home-store";
import type { Blok } from "@/lib/ontwerp/paginas";
import { mediaLijst } from "@/lib/ontwerp/media";
import { BlokWeergave, type MediaInfo } from "@/components/marketing/ontwerp/Blokken";
import type { Metadata } from "next";
import Link from "next/link";
import { Photo } from "@/components/marketing/Photo";
import { SceneMatch, SceneApprove } from "@/components/marketing/Scene";
import { HeroStage } from "@/components/marketing/HeroStage";
import { Reveal } from "@/components/marketing/Reveal";
import { FaqList } from "@/components/marketing/primitives";
import { Marquee } from "@/components/marketing/Marquee";
import { BranchShowcase } from "@/components/marketing/BranchShowcase";
import { AanbodKiezer } from "@/components/marketing/AanbodKiezer";
import { BedrijvenVoordeur } from "@/components/marketing/BedrijvenVoordeur";
import { env } from "@/lib/env";
import { serviceJsonLd, SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/ontwerp/seo-store";
import { getContentValues, lijstRegels } from "@/lib/content/store";

// De homepagina voor bedrijven (11 nov 2026): dit was de homepagina van zekerflex.com. Op verzoek van de
// eigenaar ziet wie zekerflex.com opent de pagina voor werkzoekenden (app/(marketing)/page.tsx); deze staat
// ongewijzigd hier, en de Site-ontwerper (tabblad Homepage, het voorbeeld met ?concept=1) werkt op deze pagina.
// Sinds 14 nov alleen voor bedrijven (eigenaar: "pagina ben je een bedrijf, alleen voor bedrijf"): de blokken voor
// werkers (freelancers, de drie werkvormen, de app) zijn weg en de teksten spreken het bedrijf aan; wie werk zoekt,
// vindt dat op de homepagina (/).

// titel en omschrijving: de standaard in lib/ontwerp/seo.ts, of een eigen versie uit de Site-ontwerper (SEO)
export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/bedrijven", { keywords: [...SITE.keywords] });
}

export default async function BedrijvenHomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [v, { indeling, isConcept }] = await Promise.all([getContentValues(), homeIndeling(searchParams)]);
  const t = (k: string) => v[k] ?? "";
  // de blokken onder de kop, in de volgorde uit de Site-ontwerper (tabblad Homepage); zonder eigen indeling de standaard
  const zichtbaar = zichtbareSecties(indeling);
  const eigen = await eigenBlokken(indeling, zichtbaar);
  const STEPS = [1, 2, 3].map((n) => ({ n, title: t(`how.s${n}.title`), body: t(`how.s${n}.body`) }));
  return (
    <>
      {isConcept ? (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900" role="status">
          Concept-voorbeeld van de homepage-indeling: alleen jij ziet dit.
        </div>
      ) : null}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([faqPagina(FAQ), serviceJsonLd()]),
        }}
      />
      {/* ───────────────────────────────────────────────────────────── HERO */}
      <HeroStage
        content={{
          eyebrow: t("hero.eyebrow"),
          titleLine1: t("hero.titleLine1"),
          titleLine2: t("hero.titleLine2"),
          lead: t("hero.lead"),
          ctaPrimary: t("hero.ctaPrimary"),
          ctaSecondary: t("hero.ctaSecondary"),
        }}
        photo={
          <Photo
            name="hero"
            fallback={<SceneMatch />}
            className="shadow-lift ring-1 ring-white/10"
            priority
            rounded="rounded-3xl"
            sizes="(max-width: 1024px) 100vw, (max-width: 1920px) 44vw, 780px"
          />
        }
      />

      {toonSecties(zichtbaar, {
      // vertrouwensbalk
      vertrouwen: (
      <section className="relative border-y border-white/10 bg-[#0C0E12] text-white">
        {/* telefoon: label boven, de keurmerken netjes in twee kolommen */}
        <div className="shell-4k grid grid-cols-2 gap-x-6 gap-y-3 py-7 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-12 sm:gap-y-4 sm:py-9">
          <span className="col-span-2 font-mono text-xs uppercase tracking-[0.2em] text-white/60" data-cms-key="trust.label">{t("trust.label")}</span>
          {lijstRegels(t("trust.items")).map(
            (punt, i) => (
              <Reveal key={`${i}-${punt}`} as="span" delay={i * 80} className="flex items-start gap-2.5 text-sm font-medium text-white/75 sm:items-center" cms={{ key: "trust.items", regel: i }}>
                <span className="mt-[0.45rem] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-mint sm:mt-0" />
                {punt}
              </Reveal>
            ),
          )}
        </div>
        <div className="border-t border-white/5 bg-[#0A0C10]">
          <Marquee items={lijstRegels(t("marquee.items"))} />
        </div>
      </section>

      ),
      // voordeur: wat wil je doen?
      voordeur: <BedrijvenVoordeur />,
      // aanbod: waar ben je naar op zoek?
      aanbod: (
      <AanbodKiezer />

      ),
      branches: (
      <BranchShowcase minRateCents={env.MIN_SHIFT_RATE_CENTS} voor="bedrijven" />

      ),
      hoe: (
      <section id="hoe-het-werkt" className="relative scroll-mt-24 bg-paper">
        <div className="shell-4k py-8 md:py-10 lg:py-12">
          <Reveal>
            <p className="eyebrow" data-cms-key="how.eyebrow">{t("how.eyebrow")}</p>
            <h2 className="fluid-h2 mt-4 max-w-3xl text-balance font-display font-bold" data-cms-key="how.title">
              {t("how.title")}
            </h2>
            <p className="fluid-lead mt-5 max-w-2xl text-neutralx-600" data-cms-key="how.lead" data-cms-ml="1">
              {t("how.lead")}
            </p>
          </Reveal>

          <ol className="mt-10 grid md:mt-16 gap-6 md:grid-cols-3 lg:gap-8">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} as="li" delay={i * 120} className="relative">
                <div className="glass-light group h-full rounded-3xl p-6 md:p-8 transition-transform duration-500 hover:-translate-y-1.5">
                  <div className="flex items-center gap-4">
                    <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 font-display text-lg font-bold text-white shadow-glow">
                      {i + 1}
                    </span>
                    {i < STEPS.length - 1 && (
                      <span className="hidden h-px flex-1 bg-gradient-to-r from-brand-300/70 to-transparent md:block" />
                    )}
                  </div>
                  <h3 className="mt-6 font-display text-2xl font-semibold" data-cms-key={`how.s${s.n}.title`}>{s.title}</h3>
                  <p className="mt-3 text-[1.02rem] leading-relaxed text-neutralx-600" data-cms-key={`how.s${s.n}.body`} data-cms-ml="1">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      ),
      bedrijven: (
      <ShowcaseSplit
        reverse
        tone="ink"
        keys={{ eyebrow: "emp.eyebrow", title: "emp.title", body: "emp.body" }}
        eyebrow={t("emp.eyebrow")}
        title={t("emp.title")}
        body={t("emp.body")}
        points={lijstRegels(t("emp.points"))}
        pointsKey="emp.points"
        href="/voor-bedrijven"
        cta={t("emp.cta")}
        ctaKey="emp.cta"
        photo={<Photo name="employer" fallback={<SceneApprove />} rounded="rounded-3xl" sizes="(max-width:1024px) 100vw, 52vw" />}
      />

      ),
      cijfers: (
      <section className="relative isolate overflow-hidden bg-[#0C0E12] text-white">
        <div className="aurora opacity-70" aria-hidden />
        <div className="shell-4k relative py-8 md:py-10 lg:py-12">
          <div className="grid gap-10 sm:grid-cols-2 sm:gap-14 lg:grid-cols-4">
            {/* de grote cijfers staan vast (bedragen: lib/pricing/tiers.ts); de regel eronder is een tekst */}
            {[
              { v: "€ 3,50", k: "cijfers.1" },
              { v: "€ 0", k: "cijfers.2" },
              { v: "GPS", k: "cijfers.3" },
              { v: "1 klik", k: "cijfers.4" },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 100}>
                <div className="fluid-stat font-display font-bold text-brand-mint">{s.v}</div>
                <div className="mt-3 text-sm text-white/55" data-cms-key={s.k}>{t(s.k)}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      ),
      functies: (
      <section className="relative bg-paper-soft">
        <div className="shell-4k py-8 md:py-10 lg:py-12">
          <Reveal>
            <p className="eyebrow" data-cms-key="feat.eyebrow">{t("feat.eyebrow")}</p>
            <h2 className="fluid-h2 mt-4 max-w-3xl text-balance font-display font-bold" data-cms-key="feat.title">
              {t("feat.title")}
            </h2>
          </Reveal>
          <div className="mt-10 grid md:mt-16 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.k} delay={(i % 3) * 90}>
                <div className="glass-light h-full rounded-2xl p-6 md:p-7">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-500">{f.icon}</div>
                  <h3 className="mt-5 font-display text-lg font-semibold" data-cms-key={`${f.k}.title`}>{t(`${f.k}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutralx-600" data-cms-key={`${f.k}.body`} data-cms-ml="1">{t(`${f.k}.body`)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      ),
      zekerheid: (
      <section className="relative bg-paper">
        <div className="shell-4k grid gap-10 py-10 md:gap-10 md:py-14 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:py-16">
          <Reveal>
            <p className="eyebrow" data-cms-key="comp.eyebrow">{t("comp.eyebrow")}</p>
            <h2 className="fluid-h2 mt-4 text-balance font-display font-bold" data-cms-key="comp.title">
              {t("comp.title")}
            </h2>
            <p className="fluid-lead mt-5 text-neutralx-600" data-cms-key="comp.lead" data-cms-ml="1">
              {t("comp.lead")}
            </p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {["comp.c1", "comp.c2", "comp.c3", "comp.c4"].map((k, i) => (
              <Reveal key={k} delay={i * 90}>
                <div className="card h-full p-6">
                  <h3 className="font-display text-base font-semibold" data-cms-key={`${k}.title`}>{t(`${k}.title`)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600" data-cms-key={`${k}.body`} data-cms-ml="1">{t(`${k}.body`)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      ),
      citaat: (
      <section className="relative isolate overflow-hidden bg-[#0C0E12] text-white">
        <div className="aurora opacity-60" aria-hidden />
        <div className="shell-4k relative py-8 md:py-10 lg:py-12">
          <Reveal className="mx-auto max-w-4xl text-center">
            <figure>
              <blockquote className="text-balance font-display text-[clamp(1.5rem,1.1rem+1.6vw,2.6rem)] font-semibold leading-snug">
                &ldquo;<span data-cms-key="quote.text" data-cms-ml="1">{t("quote.text")}</span>&rdquo;
              </blockquote>
              <figcaption className="mt-8 text-sm text-white/50" data-cms-key="quote.author">
                {t("quote.author")}
              </figcaption>
            </figure>
          </Reveal>
        </div>
      </section>

      ),
      vragen: (
      <section className="relative bg-paper-soft">
        <div className="shell-4k grid gap-8 py-10 md:gap-10 md:py-14 lg:grid-cols-[0.8fr_1.2fr] lg:py-16">
          <Reveal>
            <p className="eyebrow" data-cms-key="faq.eyebrow">{t("faq.eyebrow")}</p>
            <h2 className="fluid-h2 mt-4 font-display font-bold" data-cms-key="faq.title">{t("faq.title")}</h2>
          </Reveal>
          <Reveal delay={120}>
            <FaqList items={FAQ} />
          </Reveal>
        </div>
      </section>

      ),
      oproep: (
      <section className="relative isolate overflow-hidden hero-ink text-white">
        <div className="aurora" aria-hidden />
        <div className="shell-4k relative py-8 md:py-10 lg:py-12">
          <Reveal className="flex flex-col items-start justify-between gap-10 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <h2 className="fluid-h2 text-balance font-display font-bold" data-cms-key="cta.title">{t("cta.title")}</h2>
              <p className="fluid-lead mt-4 text-white/65" data-cms-key="cta.lead" data-cms-ml="1">
                {t("cta.lead")}
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap gap-3">
              <Link href="/klus-plaatsen" className="btn-mint text-base" data-cms-key="cta.primary">
                {t("cta.primary")}
              </Link>
              <Link href="/prijzen" className="btn-ghost-invert text-base" data-cms-key="cta.secondary">
                {t("cta.secondary")}
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
      ),
      }, eigen)}
    </>
  );
}

/* ─────────────────────────────────────────────────── indeling (ontwerper) */

/** Live indeling; een platformbeheerder ziet met ?concept=1 het concept (het voorbeeld in de Site-ontwerper). */
async function homeIndeling(searchParams: Promise<Record<string, string | string[] | undefined>>): Promise<{ indeling: HomeIndeling | null; isConcept: boolean }> {
  const sp = await searchParams.catch(() => ({}) as Record<string, string | string[] | undefined>);
  if (sp.concept === "1") {
    const principal = await getPrincipal().catch(() => null);
    if (principal && hasRole(principal, "PLATFORM_ADMIN")) {
      return { indeling: await getConceptHomeIndeling().catch(() => null), isConcept: true };
    }
  }
  return { indeling: await getLiveHomeIndeling().catch(() => null), isConcept: false };
}

interface EigenBlokken {
  blokken: Map<string, Blok>;
  media: Record<string, MediaInfo>;
}

/** De vaste blokken en de eigen blokken (zoals op eigen pagina's) in de gekozen volgorde. */
function toonSecties(volgorde: HomeItem[], blokken: Record<HomeSectie, ReactNode>, eigen: EigenBlokken) {
  return volgorde.map((id) => {
    if (isSectie(id)) return <Fragment key={id}>{blokken[id]}</Fragment>;
    const blok = eigen.blokken.get(id);
    return blok ? <BlokWeergave key={id} blok={blok} media={eigen.media} eerste={false} /> : null;
  });
}

async function eigenBlokken(indeling: HomeIndeling | null, zichtbaar: HomeItem[]): Promise<EigenBlokken> {
  const blokken = new Map((indeling?.eigen ?? []).map((b) => [eigenSleutel(b), b] as const));
  // de mediabibliotheek alleen ophalen als er een eigen blok op de pagina staat
  if (!zichtbaar.some((id) => blokken.has(id))) return { blokken, media: {} };
  const media: Record<string, MediaInfo> = Object.fromEntries((await mediaLijst().catch(() => [])).map((m) => [m.id, { alt: m.alt, soort: m.soort }]));
  return { blokken, media };
}

/* ─────────────────────────────────────────────────────── showcase split */

function ShowcaseSplit({
  eyebrow,
  title,
  body,
  points,
  href,
  cta,
  photo,
  reverse = false,
  tone = "paper",
  keys,
  pointsKey,
  ctaKey,
}: {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  href: string;
  cta: string;
  photo: ReactNode;
  reverse?: boolean;
  tone?: "paper" | "ink";
  keys?: { eyebrow: string; title: string; body: string };
  /** tekst-sleutels voor het voorbeeld van de Site-ontwerper: de lijst (één punt per regel) en de knop */
  pointsKey?: string;
  ctaKey?: string;
}) {
  const dark = tone === "ink";
  return (
    <section className={`relative isolate overflow-hidden ${dark ? "hero-ink text-white" : "bg-paper"}`}>
      {dark && <div className="aurora opacity-50" aria-hidden />}
      <div
        className={`shell-4k relative grid items-center gap-10 py-10 md:gap-10 md:py-14 lg:py-16 lg:gap-12 ${
          reverse ? "lg:grid-cols-[0.95fr_1.05fr]" : "lg:grid-cols-[1.05fr_0.95fr]"
        }`}
      >
        <Reveal className={reverse ? "lg:order-2" : ""}>
          <p className={`eyebrow ${dark ? "text-brand-mint" : ""}`} data-cms-key={keys?.eyebrow}>{eyebrow}</p>
          <h2 className="fluid-h2 mt-4 text-balance font-display font-bold" data-cms-key={keys?.title}>{title}</h2>
          <p className={`fluid-lead mt-5 max-w-xl ${dark ? "text-white/65" : "text-neutralx-600"}`} data-cms-key={keys?.body} data-cms-ml="1">{body}</p>
          <ul className="mt-8 space-y-3.5">
            {points.map((p, i) => (
              <li key={`${i}-${p}`} className={`flex gap-3 text-[1.02rem] ${dark ? "text-white/75" : "text-neutralx-600"}`} data-cms-key={pointsKey} data-cms-regel={pointsKey ? i : undefined}>
                <span className="mt-1 flex-shrink-0">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 13l4 4L19 7" stroke={dark ? "#4FE0A0" : "#0E5C4A"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {p}
              </li>
            ))}
          </ul>
          <Link href={href} className={`${dark ? "btn-ghost-invert" : "btn-ghost"} mt-9 self-start text-base`} data-cms-key={ctaKey}>
            {cta} →
          </Link>
        </Reveal>

        <Reveal delay={120} className={`${reverse ? "lg:order-1" : ""} relative`}>
          <div className={`overflow-hidden rounded-3xl ${dark ? "ring-1 ring-white/10" : "shadow-lift"}`}>{photo}</div>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────── content */

// De teksten van de stappen, functies en zekerheden staan in het tekstregister
// (lib/content/store.ts: how.s1 …, feat.f1 …, comp.c1 …); hier alleen wat vast blijft.

const FEATURES = [
  { k: "feat.f1", icon: <IconTarget /> },
  { k: "feat.f2", icon: <IconBolt /> },
  { k: "feat.f3", icon: <IconShield /> },
  { k: "feat.f4", icon: <IconDoc /> },
  { k: "feat.f5", icon: <IconPin /> },
  { k: "feat.f6", icon: <IconBell /> },
];

// De vragen van bedrijven (14 nov: deze pagina is alleen voor bedrijven). De FAQ-gegevens voor zoekmachines
// (faqPagina, bovenaan) volgen precies deze lijst.
const FAQ = [
  { q: "Wat kost personeel via ZekerFlex?", a: "Je betaalt het uurtarief van de kracht plus € 3,50 platformkosten per gewerkt uur, en alleen als er echt gewerkt is. Bij meer uren daalt de platformfee volgens een vaste staffel. Voor personeel is er geen abonnement en zijn er geen opstartkosten; software zoals de horeca- of rijschoolpakketten werkt met een abonnement." },
  { q: "Hoe plaats ik een klus?", a: "Via Klus plaatsen stel je zonder account een klus samen: functie, plaats, tijden, aantal mensen en tarief. Je ziet meteen wat het kost. Bevalt het, dan zet je de klus met een gratis account online en zoekt ZekerFlex passende, geverifieerde mensen in de buurt." },
  { q: "Werk ik met zzp'ers of met uitzendkrachten?", a: "Allebei kan. Zzp'ers werken met hun eigen KVK-inschrijving, die we controleren tegen het Handelsregister. Uitzendkrachten werken via het ZekerFlex-uitzendbureau: dan is ZekerFlex hun werkgever en regelt de verloning." },
  { q: "Moet ik zelf facturen maken?", a: "Nee. Zodra je de uren hebt goedgekeurd, maakt ZekerFlex de facturen automatisch aan, met de juiste btw-behandeling." },
  { q: "Hoe ondersteunt ZekerFlex bij de Wet DBA?", a: "ZekerFlex legt afspraken vast en signaleert onder meer urenconcentratie en opeenvolgende weken. Zulke hulpmiddelen geven geen garantie over de arbeidsrelatie: de Belastingdienst kijkt ook naar hoe er in de praktijk wordt gewerkt." },
  { q: "Is mijn data veilig?", a: "Voor diensten zoals betalingen, e-mail en verificatie gebruiken we gespecialiseerde aanbieders. Gevoelige gegevens worden waar nodig versleuteld opgeslagen; belangrijke handelingen komen in een auditspoor." },
];

/** schema.org FAQPage met precies de vragen die op deze pagina staan. */
function faqPagina(items: { q: string; a: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}

/* icons */
function IconTarget() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>); }
function IconBolt() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill="currentColor" /></svg>); }
function IconShield() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>); }
function IconDoc() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 3h8l4 4v14H6V3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 12h6M9 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>); }
function IconPin() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="12" cy="10" r="2.5" fill="currentColor" /></svg>); }
function IconBell() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 16V10a6 6 0 1 1 12 0v6l2 2H4l2-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>); }
