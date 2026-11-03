import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ACTIVITEITEN, BASE, CONTACT, DOELGROEPEN, REVIEWS, THEMAFEESTEN, activiteit, doelgroepHref, type Activiteit } from "@/lib/voorstel/schwarzwald";
import type { Blok } from "@/lib/voorstel/schwarzwald-paginas";
import { paginaVoorSite } from "@/lib/voorstel/schwarzwald-cms";
import { ActiviteitKaart, ArrangementBlok, Beeld, CtaBand, Sterren } from "@/components/voorstel/SchwarzwaldCards";
import { RunsWeergave } from "@/components/voorstel/SchwarzwaldBlokken";
import { HeroVideo } from "@/components/voorstel/HeroVideo";
import { goedgekeurdeReviews } from "@/lib/voorstel/schwarzwald-reviews";
import { sterren } from "@/lib/voorstel/review-weergave";

type Alinea = Extract<Blok, { type: "alinea" }>;
const alineaDieBegintMet = (blokken: Blok[], begin: string) =>
  blokken.find((b): b is Alinea => b.type === "alinea" && b.runs.map((r) => r.t).join("").startsWith(begin));

const UITGELICHT = ["buggy-rijden", "quad-rijden", "escaperoom", "e-chopper-tour", "f1-sim-race", "kever-rally"];
// absolute: anders plakt de root-layout er "· ZekerFlex" achter
export const metadata: Metadata = { title: { absolute: "Het Schwarzwald · ontwerpvoorstel" } };

const TICKER = ["Buggy", "Quad", "Escaperoom", "F1 sim race", "E-chopper", "Kever rally", "Après-ski", "Pubquiz", "Solex", "4×4 off-road"];

export default async function SchwarzwaldHome() {
  const uitgelicht = UITGELICHT.map(activiteit).filter((a): a is Activiteit => a !== undefined);
  const buggy = activiteit("buggy-rijden");
  const home = await paginaVoorSite("/");
  // beoordelingen van eigen gasten eerst, aangevuld met die van hun huidige site
  const gasten = (await goedgekeurdeReviews().catch(() => [])).slice(0, 3);
  const getoond = [
    ...gasten.map((r) => ({ sleutel: r.id, tekst: r.tekst, naam: r.naam, bij: activiteit(r.activiteit)?.naam ?? "", score: r.score as number | null, antwoord: r.antwoord })),
    ...REVIEWS.map((r) => ({ sleutel: r.naam, tekst: r.tekst, naam: r.naam, bij: r.bij, score: null as number | null, antwoord: "" })),
  ].slice(0, 3);
  const trending = home && alineaDieBegintMet(home.blokken, "Trending");
  const intro = home && alineaDieBegintMet(home.blokken, "Het Schwarzwald in Rijssen");

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-schw-night text-schw-cream">
        <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-10 h-[420px] w-[420px] animate-aurora-drift rounded-full bg-schw-orange/25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-0 h-[380px] w-[380px] animate-aurora-drift rounded-full bg-schw-moss/70 blur-3xl [animation-delay:-6s]" />
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-4 pb-24 pt-12 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-32 lg:pt-20">
          <div className="animate-fade-up">
            <h1 className="font-display text-[clamp(3.4rem,11vw,7.5rem)] font-bold leading-[0.88] tracking-[-0.03em]">
              <span className="block">Je beleeft</span>
              <span className="mt-2 block">
                <span className="inline-block -rotate-3 rounded-2xl bg-schw-orange px-4 pb-2 text-schw-night">&apos;t</span>{" "}
                <span className="text-schw-sun">hier.</span>
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-schw-cream/80">
              Buggy&apos;s, quads, zes escaperooms en feesten waar maandag nog over gepraat wordt. Activiteit, eten en drinken op één plek in de bossen van Rijssen.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href={`${BASE}/reserveren`}
                className="rounded-full bg-schw-orange px-7 py-4 font-bold text-schw-night shadow-[0_14px_40px_-12px_rgba(255,95,31,0.8)] transition-transform hover:-translate-y-0.5"
              >
                Reserveer je uitje
              </Link>
              <Link href={`${BASE}/activiteiten`} className="rounded-full border border-white/20 px-7 py-4 font-semibold text-schw-cream transition-colors hover:bg-white/10">
                Bekijk {ACTIVITEITEN.length} activiteiten
              </Link>
            </div>
            <p className="mt-8 flex items-center gap-3 text-sm text-schw-cream/80">
              <Sterren className="text-lg" />
              <span>
                <strong className="text-schw-cream">{CONTACT.score}</strong> uit {CONTACT.aantalReviews} beoordelingen
              </span>
            </p>
          </div>

          <div className="relative mx-auto aspect-square w-full max-w-[560px]">
            <div className="absolute inset-[6%_10%_18%_0] -rotate-3 overflow-hidden rounded-[2rem] shadow-2xl ring-4 ring-schw-cream/10">
              {/* hun eigen sfeervideo van hetschwarzwald.nl, lichter gemaakt (540p, zonder geluid) */}
              <HeroVideo src="/voorstel/schwarzwald/sfeer.mp4" poster="/voorstel/schwarzwald/sfeer-poster.webp" label="Sfeervideo: het perfecte kerst-bedrijfsfeest bij Het Schwarzwald" />
            </div>
            <div className="absolute bottom-0 right-0 aspect-[4/3] w-[48%] rotate-[5deg] animate-float overflow-hidden rounded-3xl shadow-2xl ring-4 ring-schw-night">
              <Image src="/voorstel/schwarzwald/quad.webp" alt="Quads door de modder op de crossbaan" fill sizes="280px" className="object-cover" />
            </div>
            <div className="absolute bottom-[8%] left-[2%] aspect-square w-[32%] -rotate-6 overflow-hidden rounded-3xl shadow-2xl ring-4 ring-schw-night [animation-delay:-3s] animate-float">
              <Image src="/voorstel/schwarzwald/feest.webp" alt="Feestende groep met gekke hoeden tijdens de pubquiz" fill sizes="180px" className="object-cover" />
            </div>
            <Link
              href="#indoor"
              aria-label="Nieuw: indoor entertainment megacenter in Rijssen"
              className="absolute -top-2 right-[4%] grid h-28 w-28 place-items-center rounded-full bg-schw-sun text-schw-night shadow-xl sm:h-32 sm:w-32"
            >
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full animate-[spin_18s_linear_infinite]" aria-hidden="true">
                <defs>
                  <path id="schw-ring" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" />
                </defs>
                <text className="fill-schw-night text-[9.5px] font-bold uppercase tracking-[0.14em]">
                  <textPath href="#schw-ring">Nieuw · indoor · megacenter ·</textPath>
                </text>
              </svg>
              <span className="font-display text-2xl font-bold" aria-hidden="true">
                ★
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div className="relative z-10 -mt-12 overflow-hidden py-6" aria-hidden="true">
        <div className="-mx-10 -rotate-2 bg-schw-orange py-4 shadow-xl">
          <div className="flex w-max animate-ticker gap-8 whitespace-nowrap font-display text-2xl font-bold uppercase text-schw-night sm:text-3xl">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={`${t}-${i}`} className="flex items-center gap-8">
                {t}
                <span className="text-schw-cream">✦</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Hun eigen homepage-tekst, letterlijk */}
      {(intro || trending) && (
        <section className="mx-auto grid max-w-[1280px] gap-8 px-4 pt-20 sm:px-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-orange">Over ons</p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">{home?.titel}</h2>
            {intro && (
              <p className="mt-5 text-lg leading-relaxed text-schw-night/85">
                <RunsWeergave runs={intro.runs} />
              </p>
            )}
          </div>
          {trending && (
            <div className="rounded-xl3 bg-schw-night p-7 text-schw-cream sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Trending</p>
              <p className="mt-3 leading-relaxed text-schw-cream/90">
                <RunsWeergave runs={trending.runs} />
              </p>
            </div>
          )}
        </section>
      )}

      {/* Doelgroepen */}
      <section className="mx-auto max-w-[1280px] px-4 pb-20 pt-20 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-orange">Voor elke groep</p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Wat vieren jullie?</h2>
          </div>
          <p className="max-w-md text-schw-mute">Kies je gelegenheid en je ziet meteen wat erbij past, inclusief prijzen en arrangementen.</p>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {DOELGROEPEN.map((d) => (
            <Link
              key={d.slug}
              href={doelgroepHref(d)}
              className="group relative aspect-[4/5] overflow-hidden rounded-xl3 bg-schw-forest sm:aspect-[4/3]"
            >
              <Image
                src={d.foto}
                alt=""
                fill
                sizes="(max-width: 1024px) 50vw, 400px"
                className="object-cover opacity-90 transition-transform duration-700 ease-spring group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-schw-night/90 via-schw-night/20 to-transparent" />
              {d.nieuw && <span className="absolute left-4 top-4 rounded-full bg-schw-sun px-3 py-1 text-xs font-bold text-schw-night">Nieuw</span>}
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4 sm:p-6">
                <span className="font-display text-lg font-bold leading-tight text-schw-cream sm:text-3xl">{d.tegel}</span>
                <span aria-hidden="true" className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-schw-orange text-schw-night transition-transform group-hover:rotate-[-35deg] sm:grid">
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Activiteiten */}
      <section className="bg-schw-sand py-20">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-orange">Activiteiten</p>
              <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Kies je avontuur</h2>
            </div>
            <Link href={`${BASE}/activiteiten`} className="rounded-full bg-schw-night px-6 py-3 text-sm font-bold text-schw-cream">
              Alle {ACTIVITEITEN.length} activiteiten →
            </Link>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {uitgelicht.map((a) => (
              <ActiviteitKaart key={a.slug} a={a} />
            ))}
          </div>
        </div>
      </section>

      {/* Zo werkt het */}
      <section className="mx-auto grid max-w-[1280px] gap-12 px-4 py-20 sm:px-8 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-orange">Zo simpel is het</p>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Eén dag vol FUN, wij regelen de rest</h2>
          <ol className="mt-10 space-y-8">
            {[
              ["Kies je activiteit", "Van buggy tot escaperoom. Twijfel je? Combineer er gewoon twee."],
              ["Maak het compleet", "BBQ, bourgondische hittesteen of buffet, met onbeperkt bier, fris en wijn."],
              ["Reserveer en beleef", "Online in een paar klikken. Jullie hoeven alleen nog te komen."],
            ].map(([kop, tekst], i) => (
              <li key={kop} className="flex gap-5">
                <span className="font-display text-5xl font-bold leading-none text-schw-orange">{i + 1}</span>
                <div>
                  <h3 className="font-display text-xl font-bold">{kop}</h3>
                  <p className="mt-1 text-schw-mute">{tekst}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        {buggy?.arrangement && (
          <div className="relative">
            <div className="absolute -right-3 -top-3 z-10 rotate-6 rounded-full bg-schw-sun px-4 py-2 text-sm font-bold text-schw-night shadow-lg">Trending</div>
            <ArrangementBlok titel="Voorbeeld: het buggy-arrangement" stappen={buggy.arrangement.stappen} prijs={buggy.arrangement.prijs} />
          </div>
        )}
      </section>

      {/* Indoor teaser */}
      <section id="indoor" className="scroll-mt-20 px-4 sm:px-8">
        <div className="relative mx-auto max-w-[1280px] overflow-hidden rounded-[2.5rem] bg-schw-night px-6 py-16 text-schw-cream sm:px-14 sm:py-20">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 animate-glow-pulse rounded-full bg-schw-orange/40 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/3 h-80 w-80 animate-glow-pulse rounded-full bg-schw-sun/20 blur-3xl [animation-delay:-2s]" />
          <div className="relative max-w-3xl">
            <span className="rounded-full bg-schw-sun px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-schw-night">Binnenkort</span>
            <h2 className="mt-6 font-display text-[clamp(2.4rem,6vw,4.5rem)] font-bold leading-[0.95] tracking-[-0.02em]">
              Ons nieuwe indoor entertainment <span className="text-schw-orange">megacenter</span> in Rijssen.
            </h2>
            <p className="mt-6 max-w-xl text-lg text-schw-cream/80">FUN bij elk weer. Wil je als eerste weten wanneer de deuren opengaan?</p>
            <a
              href={`mailto:${CONTACT.email}?subject=${encodeURIComponent("Houd me op de hoogte van het indoor centrum")}`}
              className="mt-8 inline-block rounded-full bg-schw-cream px-7 py-4 font-bold text-schw-night transition-transform hover:-translate-y-0.5"
            >
              Houd me op de hoogte
            </a>
          </div>
        </div>
      </section>

      {/* Themafeesten */}
      <section className="py-20">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-end justify-between gap-4 px-4 sm:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-orange">Themafeesten</p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Feesten met een verhaal</h2>
          </div>
          <Link href={`${BASE}/themafeesten`} className="font-semibold text-schw-night underline decoration-schw-orange decoration-2 underline-offset-4">
            Alle themafeesten
          </Link>
        </div>
        <div className="mx-auto mt-10 flex max-w-[1280px] snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 sm:px-8">
          {THEMAFEESTEN.map((t) => (
            <Link
              key={t.slug}
              href={`${BASE}${t.bron}`}
              className="group w-[78%] shrink-0 snap-start overflow-hidden rounded-xl3 bg-white shadow-[0_18px_40px_-24px_rgba(10,18,14,0.35)] sm:w-[340px]"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <Beeld src={t.foto} alt={t.naam} sizes="340px" className="transition-transform duration-700 ease-spring group-hover:scale-105" />
              </div>
              <div className="p-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-schw-orange">{t.kort}</p>
                <h3 className="mt-1 font-display text-xl font-bold">{t.naam}</h3>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Reviews */}
      <section className="bg-schw-forest py-20 text-schw-cream">
        <div className="mx-auto grid max-w-[1280px] gap-12 px-4 sm:px-8 lg:grid-cols-[0.8fr_2fr]">
          <div>
            <p className="font-display text-[7rem] font-bold leading-none text-schw-sun">{CONTACT.score}</p>
            <Sterren className="mt-2 block text-2xl" />
            <p className="mt-3 text-schw-cream/80">gemiddeld uit {CONTACT.aantalReviews} beoordelingen</p>
          </div>
          <ul className="grid gap-5 md:grid-cols-3">
            {getoond.map((r) => (
              <li key={r.sleutel} className="flex flex-col rounded-xl3 bg-white/5 p-6 ring-1 ring-white/10">
                {r.score !== null && (
                  <p className="mb-2 text-schw-sun" aria-label={`${r.score} van 5 sterren`}>
                    {sterren(r.score)}
                  </p>
                )}
                <blockquote className="flex-1 leading-relaxed text-schw-cream/90">&ldquo;{r.tekst}&rdquo;</blockquote>
                {r.antwoord && <p className="mt-3 border-l-2 border-schw-orange pl-3 text-sm text-schw-cream/70">Het Schwarzwald: {r.antwoord}</p>}
                <p className="mt-5 text-sm font-bold">{r.naam}</p>
                <p className="text-sm text-schw-cream/60">{r.bij}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
