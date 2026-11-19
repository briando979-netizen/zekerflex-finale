import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BASE,
  BLOG,
  CONTACT,
  FUNCTIES,
  HERO,
  JOIN,
  KERNWOORDEN,
  KLANTEN,
  PAKKETTEN,
  PAKKETTEN_KOP,
  QUOTES,
  SLOGAN,
  STAPPEN,
  VIDEO,
  VRAAGSOORTEN,
  beeld,
  datumTekst,
  veelgesteld,
} from "@/lib/voorstel/smileyapp";
import { SwipeSmiley } from "@/components/voorstel/smileyapp/SwipeSmiley";
import { VimeoVideo } from "@/components/voorstel/smileyapp/VimeoVideo";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";
import { Kopje, PakketKaart, Vinkje } from "@/components/voorstel/smileyapp/Blokken";

// absolute: anders plakt de layout er "· Smileyapp (ontwerpvoorstel)" achter
export const metadata: Metadata = { title: { absolute: "Smileyapp · klanttevredenheid meten (ontwerpvoorstel)" } };

/** De band onder de hero: woorden van hun eigen site. */
const BAND = ["Meten", "Weten", "Verbeteren", "Eenvoudig", "Snel", "Leuk", SLOGAN];
/** De drie woorden in de kop die een eigen kleur krijgen. */
const UITGELICHT: Record<string, string> = { leukste: "text-smiley-sun", simpelste: "text-smiley-green", snelste: "text-smiley-sun" };
/** Smileys voor de kernwoorden: eenvoudig (tevreden), snel (blij), leuk (dolblij). */
const KERN_STIJL = [
  { kaart: "bg-smiley-sun text-smiley-ink", score: 8.5, kleur: "#0E2A20" },
  { kaart: "bg-smiley-green text-smiley-ink", score: 9.5, kleur: "#0E2A20" },
  { kaart: "bg-smiley-ink text-white", score: 10, kleur: "#FDD11A" },
] as const;

/** De kop van hun site, met de drie woorden in hun kleuren. */
function Kop() {
  return (
    <>
      {HERO.kop.split(/(leukste|simpelste|snelste)/).map((deel, i) =>
        Object.hasOwn(UITGELICHT, deel) ? (
          <span key={i} className={UITGELICHT[deel]}>
            {deel}
          </span>
        ) : (
          deel
        ),
      )}
    </>
  );
}

export default function SmileyappHome() {
  const vragen = veelgesteld();
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-smiley-ink text-white">
        <div aria-hidden="true" className="sm-parallax pointer-events-none absolute -left-40 -top-32 h-[520px] w-[520px] rounded-full bg-smiley-green/25 blur-3xl" style={{ "--sm-diepte": "180px" } as CSSProperties} />
        <div aria-hidden="true" className="sm-parallax pointer-events-none absolute -right-40 top-32 h-[420px] w-[420px] rounded-full bg-smiley-sun/15 blur-3xl" style={{ "--sm-diepte": "60px" } as CSSProperties} />
        <Gezicht score={9} kleur="#5ABA8E" className="sm-zweef pointer-events-none absolute left-[6%] top-[12%] hidden h-14 w-14 opacity-25 lg:block" />
        <Gezicht score={10} kleur="#FDD11A" className="sm-zweef pointer-events-none absolute bottom-[18%] left-[44%] hidden h-10 w-10 opacity-30 [animation-delay:-2s] lg:block" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-4 pb-20 pt-12 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:pb-28 lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold text-smiley-sun ring-1 ring-white/15">
              <Gezicht score={10} kleur="#5ABA8E" accent="#FDD11A" className="h-5 w-5" />
              {SLOGAN}
            </p>
            <h1 className="mt-6 font-display text-[clamp(2.1rem,6.4vw,4.4rem)] font-bold leading-[1.02] tracking-[-0.02em] [hyphens:auto] md:[hyphens:manual] lg:text-[clamp(3rem,5.3vw,4rem)]">
              <Kop />
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">{HERO.vraag}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="#pakketten"
                className="rounded-full bg-smiley-sun px-7 py-4 font-bold text-smiley-ink shadow-[0_18px_40px_-14px_rgba(253,209,26,0.7)] transition-transform hover:-translate-y-0.5"
              >
                Kies een pakket
              </Link>
              <Link href="#video" className="inline-flex items-center gap-2.5 rounded-full border border-white/25 px-6 py-4 font-semibold text-white transition-colors hover:bg-white/10">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M3 1.5v11l9-5.5z" fill="currentColor" />
                </svg>
                Bekijk de video ({VIDEO.duur})
              </Link>
            </div>
            <ul className="mt-10 flex flex-wrap gap-2 text-sm font-bold">
              {KERNWOORDEN.items.map((k, i) => (
                <li key={k.titel} className="inline-flex items-center gap-2 rounded-full bg-white/5 py-1.5 pl-1.5 pr-4 ring-1 ring-white/15">
                  <Gezicht score={[8, 9, 10][i] ?? 10} kleur="#5ABA8E" accent="#FDD11A" className="h-6 w-6" />
                  {k.titel}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-[440px]">
            <span className="sm-zweef absolute -left-2 top-10 z-10 hidden rounded-2xl bg-white px-4 py-3 text-sm font-bold text-smiley-ink shadow-xl [--sm-draai:-6deg] sm:block">
              QR-code scannen
            </span>
            <span className="sm-zweef absolute -right-2 top-1/3 z-10 hidden rounded-2xl bg-smiley-sun px-4 py-3 text-sm font-bold text-smiley-ink shadow-xl [--sm-draai:5deg] [animation-delay:-2.5s] sm:block">
              NPS-scores
            </span>
            <span className="sm-zweef absolute -left-4 bottom-24 z-10 hidden rounded-2xl bg-smiley-green px-4 py-3 text-sm font-bold text-smiley-ink shadow-xl [--sm-draai:4deg] [animation-delay:-4s] sm:block">
              Realtime dashboard
            </span>
            <SwipeSmiley vraag={HERO.appVraag} />
          </div>
        </div>
        <div aria-hidden="true" className="relative overflow-hidden border-y border-white/10 bg-smiley-deep py-4">
          <div className="sm-band flex w-max whitespace-nowrap font-display text-2xl font-bold">
            {[...BAND, ...BAND].map((w, i) => (
              <span key={i} className="flex items-center gap-10 pr-10">
                {w}
                <Gezicht score={10} kleur="#5ABA8E" accent="#FDD11A" className="h-7 w-7" />
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div className="sm-onthul">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-leaf">Smileyapp</p>
            <h2 className="mt-3 font-display text-[clamp(2rem,5vw,3.4rem)] font-bold leading-[1.02] tracking-[-0.02em]">
              Geen <span className="decoration-smiley-coral decoration-[6px] [text-decoration-line:line-through]">saaie enquêtes</span>.
            </h2>
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-smiley-mute">
              {HERO.intro.map((t) => (
                <p key={t}>{t}</p>
              ))}
            </div>
          </div>
          <div className="sm-onthul relative mx-auto w-full max-w-[420px]">
            <div aria-hidden="true" className="absolute inset-6 rotate-6 rounded-[2.5rem] bg-smiley-green/30" />
            <div className="relative rounded-[2.5rem] bg-white p-6 shadow-[0_30px_80px_-40px_rgba(14,42,32,0.5)] ring-1 ring-smiley-ink/10">
              <Image src={beeld("app-telefoon.webp")} alt="De Smileyapp op een telefoon: een smiley met het cijfer 10 en de knop Volgende" width={264} height={480} className="mx-auto h-auto w-[220px]" />
            </div>
          </div>
        </div>
      </section>

      {/* Zo werkt het */}
      <section id="zo-werkt-het" aria-labelledby="zo-werkt-het-kop" className="scroll-mt-24 bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <Kopje boven="Zo werkt het" kop="Meten. Weten. Verbeteren." id="zo-werkt-het-kop">
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-smiley-mute">{JOIN.tekst[1]}</p>
            </Kopje>
            <div className="sm-scroll-blij hidden h-28 w-28 shrink-0 md:block">
              <Gezicht score={10} kleur="#5ABA8E" accent="#FDD11A" className="h-full w-full" />
            </div>
          </div>
          <ol className="mt-14 grid gap-6 md:grid-cols-3">
            {STAPPEN.map((s, i) => (
              <li key={s.titel} className="sm-onthul">
                <div className="sm-til h-full overflow-hidden rounded-[2rem] bg-smiley-cream ring-1 ring-smiley-ink/5">
                  <div className="relative bg-white">
                    <Image src={s.beeld} alt={s.alt} width={640} height={480} sizes="(min-width: 768px) 360px, 100vw" className="h-auto w-full" />
                    <span className="absolute left-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-smiley-ink font-display text-lg font-bold text-smiley-sun">{i + 1}</span>
                  </div>
                  <div className="p-6">
                    <h3 className="font-display text-2xl font-bold">{s.titel}</h3>
                    <p className="mt-2 leading-relaxed text-smiley-mute">{s.tekst}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="sm-onthul mt-12 rounded-[2rem] bg-smiley-mint p-6 sm:p-8">
            <p className="font-display text-xl font-bold">Er zijn vele mogelijkheden om jouw vragenlijst op te maken. Je kunt bijvoorbeeld kiezen uit:</p>
            <ul className="mt-5 flex flex-wrap gap-2.5">
              {VRAAGSOORTEN.map((v) => (
                <li key={v} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-smiley-leaf ring-1 ring-smiley-leaf/20">
                  {v}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Video */}
      <section id="video" aria-labelledby="video-kop" className="relative scroll-mt-24 overflow-hidden bg-smiley-ink py-20 text-white lg:py-28">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-smiley-green/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-4 sm:px-8 lg:grid-cols-[1fr_1.25fr]">
          <Kopje boven={VIDEO.bovenkop} kop={VIDEO.kop} licht id="video-kop">
            <p className="mt-5 text-lg leading-relaxed text-white/80">{VIDEO.tekst}</p>
            <Link href={`${BASE}/contact`} className="mt-8 inline-flex rounded-full bg-smiley-sun px-7 py-4 font-bold text-smiley-ink transition-transform hover:-translate-y-0.5">
              Neem contact op
            </Link>
          </Kopje>
          <div className="sm-onthul">
            <VimeoVideo id={VIDEO.vimeoId} titel={VIDEO.titel} poster={VIDEO.poster} duur={VIDEO.duur} pagina={VIDEO.pagina} />
          </div>
        </div>
      </section>

      {/* Pakketten */}
      <section id="pakketten" aria-labelledby="pakketten-kop" className="scroll-mt-24 py-20 lg:py-28">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <Kopje boven="Pakketten" kop={PAKKETTEN_KOP} id="pakketten-kop" />
          <div className="mt-14 grid gap-x-5 gap-y-10 md:grid-cols-2 xl:grid-cols-4">
            {PAKKETTEN.map((p) => (
              <div key={p.id} className="sm-onthul">
                <PakketKaart p={p} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Functies */}
      <section aria-labelledby="functies-kop" className="bg-smiley-mint py-20 lg:py-28">
        <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-4 sm:px-8 lg:grid-cols-2">
          <div className="sm-onthul relative mx-auto w-full max-w-[520px]">
            <Image src={beeld("dashboard.webp")} alt="Het dashboard van Smileyapp met de NPS-score, promotors en de gemiddelde score" width={500} height={500} className="h-auto w-full" />
            <Image
              src={beeld("widget.webp")}
              alt="De rating widget: een gemiddelde score met drie smileys, powered by Smiley App"
              width={272}
              height={315}
              className="sm-zweef absolute -bottom-6 -right-2 h-auto w-[34%] drop-shadow-2xl [--sm-draai:4deg] sm:-right-6"
            />
          </div>
          <div>
            <Kopje boven="Dashboard" kop={FUNCTIES.kop} id="functies-kop" />
            <ul className="sm-onthul mt-8 space-y-3.5 text-base">
              {FUNCTIES.punten.map((f) => (
                <li key={f} className="flex gap-3">
                  <Vinkje />
                  <span className="font-semibold">{f}</span>
                </li>
              ))}
            </ul>
            <p className="sm-onthul mt-8 rounded-2xl bg-white p-5 leading-relaxed text-smiley-mute ring-1 ring-smiley-ink/10">{FUNCTIES.widget}</p>
          </div>
        </div>
      </section>

      {/* Kernwoorden */}
      <section aria-labelledby="kern-kop" className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <Kopje boven="Eenvoudig · Snel · Leuk" kop={KERNWOORDEN.kop} id="kern-kop" />
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {KERNWOORDEN.items.map((k, i) => {
              const stijl = KERN_STIJL[i] ?? KERN_STIJL[0];
              return (
                <article key={k.titel} className={`sm-onthul rounded-[2rem] p-7 ${stijl.kaart}`}>
                  <Gezicht score={stijl.score} kleur={stijl.kleur} knipoog className="sm-wiebel h-16 w-16" />
                  <h3 className="mt-6 font-display text-3xl font-bold">{k.titel}</h3>
                  <p className="mt-3 leading-relaxed">{k.tekst}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Klanten */}
      <section id="klanten" aria-labelledby="klanten-kop" className="scroll-mt-24 py-20 lg:py-28">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <Kopje boven="Ervaringen" kop="Wat onze klanten zeggen" id="klanten-kop" />
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {QUOTES.map((q) => (
              <figure key={q.naam} className="sm-onthul relative rounded-[2rem] bg-white p-7 shadow-[0_30px_70px_-45px_rgba(14,42,32,0.5)] ring-1 ring-smiley-ink/10 sm:p-9">
                <span aria-hidden="true" className="absolute right-7 top-4 font-display text-8xl font-bold leading-none text-smiley-green/40">
                  &rdquo;
                </span>
                <blockquote className="relative space-y-4 text-lg leading-relaxed">
                  {q.tekst.map((t) => (
                    <p key={t}>{t}</p>
                  ))}
                </blockquote>
                <figcaption className="mt-7 flex items-center gap-4">
                  <Image src={q.beeld} alt="" width={120} height={120} className="h-14 w-14 rounded-full" />
                  <span>
                    <span className="block font-bold">{q.naam}</span>
                    <span className="block text-sm text-smiley-mute">{q.organisatie}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
          <h3 className="sm-onthul mt-16 text-center text-xs font-bold uppercase tracking-[0.2em] text-smiley-leaf">Case</h3>
          <ul className="sm-onthul mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {KLANTEN.map((k) => (
              <li key={k.naam}>
                <a
                  href={k.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sm-til grid h-28 place-items-center rounded-3xl bg-white p-5 ring-1 ring-smiley-ink/10 hover:ring-smiley-green"
                >
                  <Image src={k.beeld} alt={`${k.naam} (opent een nieuw venster)`} width={k.breed} height={k.hoog} className="max-h-16 w-auto object-contain" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Join the smile */}
      <section aria-labelledby="join-kop" className="relative overflow-hidden bg-smiley-ink py-20 text-white lg:py-28">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
            <Kopje kop={JOIN.kop} licht id="join-kop">
              <p className="mt-6 text-xl font-semibold leading-relaxed text-smiley-sun">{JOIN.tekst[0]}</p>
              <div className="mt-5 space-y-4 leading-relaxed text-white/80">
                {JOIN.tekst.slice(2).map((t) => (
                  <p key={t}>{t}</p>
                ))}
              </div>
              <Link href={`${BASE}/contact`} className="mt-8 inline-flex rounded-full bg-smiley-green px-7 py-4 font-bold text-smiley-ink transition-transform hover:-translate-y-0.5">
                {JOIN.knop}
              </Link>
            </Kopje>
            <div className="sm-onthul overflow-hidden rounded-[2rem] ring-1 ring-white/10">
              <Image src={beeld("bedankt.webp")} alt="Een telefoon met de Smileyapp in de hand: Bedankt! met een lachende smiley" width={1536} height={400} sizes="(min-width: 1024px) 560px, 100vw" className="h-64 w-full object-cover object-[45%_50%] sm:h-80" />
            </div>
          </div>
        </div>
      </section>

      {/* Veelgestelde vragen */}
      <section aria-labelledby="faq-kop" className="py-20 lg:py-28">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-4 sm:px-8 lg:grid-cols-[1fr_1.5fr]">
          <Kopje boven="Vragen" kop="Veelgestelde vragen" id="faq-kop">
            <p className="mt-5 leading-relaxed text-smiley-mute">
              Staat je vraag er niet bij? Stel hem aan de AI-assistent rechtsonder, of mail naar{" "}
              <a href={`mailto:${CONTACT.email}`} className="font-semibold text-smiley-leaf underline underline-offset-2">
                {CONTACT.email}
              </a>
              .
            </p>
          </Kopje>
          <div className="sm-onthul divide-y divide-smiley-ink/10 rounded-[2rem] bg-white px-6 ring-1 ring-smiley-ink/10 sm:px-8">
            {vragen.map((v) => (
              <details key={v.vraag} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-bold [&::-webkit-details-marker]:hidden">
                  {v.vraag}
                  <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-smiley-mint text-smiley-leaf transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 leading-relaxed text-smiley-mute">{v.antwoord}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Blog */}
      <section aria-labelledby="blog-kop" className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Kopje boven="Blog" kop="Meer weten over tevredenheid meten" id="blog-kop" />
            <Link href={`${BASE}/blog`} className="sm-onthul rounded-full px-5 py-3 font-bold text-smiley-ink ring-1 ring-smiley-ink/20 hover:bg-smiley-mint">
              Alle berichten
            </Link>
          </div>
          <ul className="mt-12 grid gap-6 md:grid-cols-3">
            {BLOG.slice(0, 3).map((b) => (
              <li key={b.slug} className="sm-onthul">
                <Link href={`${BASE}/blog/${b.slug}`} className="sm-til group block h-full overflow-hidden rounded-[2rem] bg-smiley-cream ring-1 ring-smiley-ink/5">
                  <Image src={b.beeld} alt="" width={b.breed} height={b.hoog} sizes="(min-width: 768px) 380px, 100vw" className="aspect-[16/9] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="p-6">
                    <p className="text-xs font-bold uppercase tracking-wider text-smiley-leaf">{datumTekst(b.datum)}</p>
                    <h3 className="mt-2 font-display text-xl font-bold leading-tight">{b.titel}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-smiley-mute">{b.samenvatting}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Afsluiter */}
      <section className="bg-smiley-sun">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-8 px-4 py-16 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <Gezicht score={10} kleur="#0E2A20" knipoog className="sm-wiebel h-16 w-16 shrink-0" />
            <p className="max-w-2xl font-display text-2xl font-bold leading-snug sm:text-3xl">
              Wil jij ook op een eenvoudige, snelle en leuke manier de tevredenheid meten? Neem dan snel contact op!
            </p>
          </div>
          <Link href={`${BASE}/contact`} className="shrink-0 rounded-full bg-smiley-ink px-8 py-4 font-bold text-white transition-transform hover:-translate-y-0.5">
            Contact opnemen
          </Link>
        </div>
      </section>
    </>
  );
}
