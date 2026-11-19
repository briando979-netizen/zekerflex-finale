import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { CONTACT, KLANTEN, QUOTES, STAPPEN, type Pakket } from "@/lib/voorstel/smileyapp";
import { taalBasis, type Vertaling } from "@/lib/voorstel/smileyapp-taal";
import { TEKSTEN, looptijdTaal, prijsTaal, veelgesteldTaal, vertaal } from "@/lib/voorstel/smileyapp-talen";
import { Kopje, Vinkje } from "@/components/voorstel/smileyapp/Blokken";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";
import { PakketKiezer } from "@/components/voorstel/smileyapp/PakketKiezer";
import { ProbeerZelf } from "@/components/voorstel/smileyapp/ProbeerZelf";
import { ReviewBlok } from "@/components/voorstel/smileyapp/ReviewBlok";

// De voorpagina van het SmileyApp-voorstel in het Engels (/en) en het Duits
// (/de), in verkorte vorm: hero, zo werkt het, probeer het zelf, pakketten met
// de pakketkiezer, klanten, veelgestelde vragen en de afsluiter. De pagina
// (app/voorstel/smileyapp/en|de/page.tsx) zet lang op de omlijsting, levert de
// kop (h1) en haalt de pakketten op; hier staat de rest. Alle tekst komt uit
// lib/voorstel/smileyapp-talen.ts; beelden, namen en prijzen komen uit dezelfde
// gegevens als de Nederlandse site (prijzen via prijsTaal: het bedrag uit het
// pakket, met de wijzigingen uit het beheer). Server-onderdelen.

/**
 * De klasse van de grote kop. Kleiner dan op de Nederlandse voorpagina: het langste Duitse woord
 * ("Kundenzufriedenheit", 19 letters) is op 390 px bij 1,9rem ongeveer 320 px breed in een kolom van 358 px. Op een
 * smaller scherm breekt de browser het af (hyphens, met lang="de" op de omlijsting); break-words is het vangnet.
 * Vanaf md staat de kop over de volle breedte en past elk woord, dus daar staat afbreken uit.
 */
export const KOP_KLASSE =
  "mt-6 max-w-4xl break-words font-display text-[clamp(1.9rem,6vw,4rem)] font-bold leading-[1.04] tracking-[-0.02em] text-balance [hyphens:auto] md:[hyphens:manual]";
/** Dezelfde maat voor de kop van de demo-aanvraag. */
export const DEMO_KOP_KLASSE = "mt-3 max-w-3xl break-words font-display text-[clamp(2.2rem,6vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.02em] text-balance [hyphens:auto] md:[hyphens:manual]";

const KLEUR = ["text-smiley-sun", "text-smiley-green", "text-smiley-sun"] as const;

/** De kop met de drie uitgelichte woorden in de kleuren van de Nederlandse kop. */
export function HeroKop({ taal }: { taal: Vertaling }) {
  const { kop, uitgelicht } = TEKSTEN[taal].hero;
  // de kop in stukken: steeds de tekst vóór een uitgelicht woord, en dan dat woord in kleur
  const delen: { tekst: string; kleur?: string }[] = [];
  let rest = kop;
  uitgelicht.forEach((woord, i) => {
    const plek = rest.indexOf(woord);
    if (plek < 0) return;
    delen.push({ tekst: rest.slice(0, plek) }, { tekst: woord, kleur: KLEUR[i] ?? KLEUR[0] });
    rest = rest.slice(plek + woord.length);
  });
  delen.push({ tekst: rest });
  return (
    <>
      {delen.map((d, i) =>
        d.kleur ? (
          <span key={i} className={d.kleur}>
            {d.tekst}
          </span>
        ) : (
          d.tekst
        ),
      )}
    </>
  );
}

/** De hero; `children` is de kop (h1) die de pagina zelf levert. */
export function LandingHero({ taal, children }: { taal: Vertaling; children: ReactNode }) {
  const t = TEKSTEN[taal].hero;
  const b = taalBasis(taal);
  return (
    <section className="relative overflow-hidden bg-smiley-ink text-white">
      <div aria-hidden="true" className="sm-parallax pointer-events-none absolute -left-40 -top-32 h-[520px] w-[520px] rounded-full bg-smiley-green/25 blur-3xl" style={{ "--sm-diepte": "180px" } as CSSProperties} />
      <div aria-hidden="true" className="sm-parallax pointer-events-none absolute -right-40 top-32 h-[420px] w-[420px] rounded-full bg-smiley-sun/15 blur-3xl" style={{ "--sm-diepte": "60px" } as CSSProperties} />
      <Gezicht score={10} kleur="#FDD11A" knipoog className="sm-zweef pointer-events-none absolute -right-10 bottom-10 hidden h-56 w-56 opacity-25 lg:block" />
      <div className="relative mx-auto max-w-[1200px] px-4 pb-20 pt-12 sm:px-8 lg:pb-28 lg:pt-20">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold text-smiley-sun ring-1 ring-white/15">
          <Gezicht score={10} kleur="#5ABA8E" accent="#FDD11A" className="h-5 w-5" />
          {t.slogan}
        </p>
        {children}
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/80">{t.vraag}</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href={`${b}#pakketten`} className="rounded-full bg-smiley-sun px-7 py-4 font-bold text-smiley-ink shadow-[0_18px_40px_-14px_rgba(253,209,26,0.7)] transition-transform hover:-translate-y-0.5">
            {t.knopPakketten}
          </Link>
          <Link href={`${b}/demo`} className="rounded-full bg-white px-7 py-4 font-bold text-smiley-ink transition-transform hover:-translate-y-0.5">
            {t.knopDemo}
          </Link>
        </div>
        <ul className="mt-10 flex flex-wrap gap-2 text-sm font-bold">
          {t.kernwoorden.map((k, i) => (
            <li key={k} className="inline-flex items-center gap-2 rounded-full bg-white/5 py-1.5 pl-1.5 pr-4 ring-1 ring-white/15">
              <Gezicht score={[8, 9, 10][i] ?? 10} kleur="#5ABA8E" accent="#FDD11A" className="h-6 w-6" />
              {k}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** De prijskaart in de taal: naam en prijs uit het pakket, het lint en de onderdelen vertaald waar dat kan. */
function PakketKaartTaal({ p, taal }: { p: Pakket; taal: Vertaling }) {
  const t = TEKSTEN[taal].pakketten;
  const donker = p.uitgelicht;
  const looptijd = looptijdTaal(p, taal);
  const label = vertaal(t.labels, p.label);
  return (
    <article
      aria-labelledby={`pakket-${p.id}`}
      className={`sm-til relative flex h-full flex-col rounded-[2rem] p-7 pt-9 ${
        donker ? "bg-smiley-ink text-white shadow-[0_40px_80px_-30px_rgba(14,42,32,0.7)] xl:-my-5 xl:py-12" : "bg-white text-smiley-ink ring-1 ring-smiley-ink/10"
      }`}
    >
      <p
        {...(label.vertaald ? {} : { lang: "nl" })}
        className={`absolute -top-3.5 left-7 rounded-full px-3.5 py-1 text-xs font-bold uppercase tracking-wider ${donker ? "bg-smiley-sun text-smiley-ink" : "bg-smiley-green text-smiley-ink"}`}
      >
        {label.tekst}
      </p>
      {/* de naam van het pakket blijft zoals hij is */}
      <h3 id={`pakket-${p.id}`} lang="nl" className="font-display text-2xl font-bold">
        {p.naam}
      </h3>
      <p className="mt-5">
        <span className={`block font-display text-[2rem] font-bold leading-none tracking-tight ${donker ? "text-smiley-sun" : "text-smiley-ink"}`}>{prijsTaal(p, taal)}</span>
        {p.prijs !== null && <span className={`mt-1.5 block text-sm font-semibold ${donker ? "text-white/75" : "text-smiley-mute"}`}>{t.maandelijks}</span>}
      </p>
      {looptijd && <p className={`mt-3 inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${donker ? "bg-white/10 text-white" : "bg-smiley-mint text-smiley-leaf"}`}>{looptijd}</p>}
      {p.onderdelen.length > 0 && (
        <ul className="mt-6 space-y-3 text-sm">
          {p.onderdelen.map((o) => {
            // een onderdeel dat het team zelf schreef, staat niet in de tabel: dat blijft Nederlands
            const v = vertaal(t.onderdelen, o);
            return (
              <li key={o} className="flex gap-2.5">
                <Vinkje licht={donker} />
                <span {...(v.vertaald ? {} : { lang: "nl" })}>{v.tekst}</span>
              </li>
            );
          })}
        </ul>
      )}
      {p.uitleg && (
        <div className={`mt-5 space-y-3 text-sm leading-relaxed ${donker ? "text-white/80" : "text-smiley-mute"}`}>
          {p.uitleg.map((u) => {
            const v = vertaal(t.uitleg, u);
            return (
              <p key={u} {...(v.vertaald ? {} : { lang: "nl" })}>
                {v.tekst}
              </p>
            );
          })}
        </div>
      )}
      <div className="mt-auto pt-8">
        <Link
          href={`${taalBasis(taal)}/demo?pakket=${p.id}`}
          className={`block rounded-full px-6 py-3.5 text-center font-bold transition-transform hover:-translate-y-0.5 ${donker ? "bg-smiley-sun text-smiley-ink" : "bg-smiley-ink text-white"}`}
        >
          {t.demoKnop}
          <span className="sr-only"> ({p.naam})</span>
        </Link>
      </div>
    </article>
  );
}

/** Alles onder de hero. `pakketten`: zoals de site ze nu toont (smileyappPakketten). */
export function LandingTaal({ taal, pakketten }: { taal: Vertaling; pakketten: readonly Pakket[] }) {
  const t = TEKSTEN[taal];
  const b = taalBasis(taal);
  const vragen = veelgesteldTaal(pakketten, taal);
  return (
    <>
      {/* Zo werkt het */}
      <section id="zo-werkt-het" aria-labelledby="zo-werkt-het-kop" className="scroll-mt-24 bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <Kopje boven={t.hoe.boven} kop={t.hoe.kop} id="zo-werkt-het-kop">
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-smiley-mute">{t.hoe.stappen[0]?.tekst}</p>
            </Kopje>
            <div className="sm-scroll-blij hidden h-28 w-28 shrink-0 md:block">
              <Gezicht score={10} kleur="#5ABA8E" accent="#FDD11A" className="h-full w-full" />
            </div>
          </div>
          <ol className="mt-14 grid gap-6 md:grid-cols-3">
            {t.hoe.stappen.map((s, i) => (
              <li key={s.titel} className="sm-onthul">
                <div className="sm-til h-full overflow-hidden rounded-[2rem] bg-smiley-cream ring-1 ring-smiley-ink/5">
                  <div className="relative bg-white">
                    {/* dezelfde illustraties als de Nederlandse stappen */}
                    <Image src={STAPPEN[i]?.beeld ?? STAPPEN[0].beeld} alt={s.alt} width={640} height={480} sizes="(min-width: 768px) 360px, 100vw" className="h-auto w-full" />
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
            <p className="font-display text-xl font-bold">{t.hoe.vraagsoortenKop}</p>
            <ul className="mt-5 flex flex-wrap gap-2.5">
              {t.hoe.vraagsoorten.map((v) => (
                <li key={v} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-smiley-leaf ring-1 ring-smiley-leaf/20">
                  {v}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Probeer het zelf */}
      <section id="probeer" aria-labelledby="probeer-kop" className="scroll-mt-24 py-20 lg:py-28">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <Kopje boven={t.probeerBlok.boven} kop={t.probeerBlok.kop} id="probeer-kop">
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-smiley-mute">
              {t.hoe.stappen[1]?.tekst} {t.probeerBlok.intro}
            </p>
          </Kopje>
          <div className="sm-onthul mt-12">
            <ProbeerZelf vraag={t.probeerBlok.vraag} teksten={t.probeer} />
          </div>
        </div>
      </section>

      {/* Pakketten */}
      <section id="pakketten" aria-labelledby="pakketten-kop" className="scroll-mt-24 bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <Kopje boven={t.pakketten.boven} kop={t.pakketten.kop} id="pakketten-kop" />
          <div className="mt-14 grid gap-x-5 gap-y-10 md:grid-cols-2 xl:grid-cols-4">
            {pakketten.map((p) => (
              <div key={p.id} className="sm-onthul">
                <PakketKaartTaal p={p} taal={taal} />
              </div>
            ))}
          </div>
          <div className="sm-onthul mt-16">
            <PakketKiezer pakketten={pakketten} teksten={t.kiezer} basis={b} />
          </div>
        </div>
      </section>

      {/* Reviews die het team zelf invoerde, met vertaalde kop en voetregel; zonder zichtbare review staat hier niets */}
      <ReviewBlok taal={taal} />

      {/* Klanten */}
      <section id="klanten" aria-labelledby="klanten-kop" className="scroll-mt-24 py-20 lg:py-28">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Kopje boven={t.klanten.boven} kop={t.klanten.kop} id="klanten-kop" />
            <Link href={`${taalBasis("nl")}/klanten`} hrefLang="nl" className="sm-onthul rounded-full px-5 py-3 font-bold text-smiley-ink ring-1 ring-smiley-ink/20 hover:bg-smiley-mint">
              {t.klanten.verhalen}
            </Link>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {QUOTES.map((q, i) => (
              <figure key={q.naam} className="sm-onthul relative rounded-[2rem] bg-white p-7 shadow-[0_30px_70px_-45px_rgba(14,42,32,0.5)] ring-1 ring-smiley-ink/10 sm:p-9">
                <span aria-hidden="true" className="absolute right-7 top-4 font-display text-8xl font-bold leading-none text-smiley-green/40">
                  &rdquo;
                </span>
                {/* de vertaling van de quote; naam en organisatie blijven zoals ze zijn */}
                <blockquote className="relative space-y-4 text-lg leading-relaxed">
                  {(t.klanten.quotes[i] ?? []).map((alinea) => (
                    <p key={alinea}>{alinea}</p>
                  ))}
                </blockquote>
                <figcaption className="mt-7 flex items-center gap-4">
                  <Image src={q.beeld} alt="" width={120} height={120} className="h-14 w-14 rounded-full" />
                  <span>
                    <span className="block font-bold">{q.naam}</span>
                    <span className="block text-sm text-smiley-mute">{q.organisatie}</span>
                    <span className="mt-1 block text-xs font-semibold text-smiley-leaf">{t.klanten.vertaald}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
          <h3 className="sm-onthul mt-16 text-center text-xs font-bold uppercase tracking-[0.2em] text-smiley-leaf">{t.klanten.case}</h3>
          <ul className="sm-onthul mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {KLANTEN.map((k) => (
              <li key={k.naam}>
                <a href={k.url} target="_blank" rel="noopener noreferrer" className="sm-til grid h-28 place-items-center rounded-3xl bg-white p-5 ring-1 ring-smiley-ink/10 hover:ring-smiley-green">
                  <Image src={k.beeld} alt={`${k.naam} ${t.klanten.nieuwVenster}`} width={k.breed} height={k.hoog} className="max-h-16 w-auto object-contain" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Veelgestelde vragen */}
      <section id="vragen" aria-labelledby="faq-kop" className="scroll-mt-24 bg-white py-20 lg:py-28">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-4 sm:px-8 lg:grid-cols-[1fr_1.5fr]">
          <Kopje boven={t.faq.boven} kop={t.faq.kop} id="faq-kop">
            <p className="mt-5 leading-relaxed text-smiley-mute">
              {t.faq.intro}{" "}
              <a href={`mailto:${CONTACT.email}`} className="font-semibold text-smiley-leaf underline underline-offset-2">
                {CONTACT.email}
              </a>
              .
            </p>
          </Kopje>
          <div className="sm-onthul divide-y divide-smiley-ink/10 rounded-[2rem] bg-smiley-cream px-6 ring-1 ring-smiley-ink/10 sm:px-8">
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

      {/* Afsluiter */}
      <section className="bg-smiley-sun">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-8 px-4 py-16 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <Gezicht score={10} kleur="#0E2A20" knipoog className="sm-wiebel h-16 w-16 shrink-0" />
            <p className="max-w-2xl font-display text-2xl font-bold leading-snug sm:text-3xl">{t.afsluiter.tekst}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link href={`${b}/demo`} className="rounded-full bg-smiley-ink px-8 py-4 font-bold text-white transition-transform hover:-translate-y-0.5">
              {t.afsluiter.knopDemo}
            </Link>
            <a href={`mailto:${CONTACT.email}`} className="rounded-full px-8 py-4 font-bold text-smiley-ink ring-2 ring-smiley-ink transition-transform hover:-translate-y-0.5">
              {t.afsluiter.knopMail}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
