import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { BASE, KLANTEN, VIDEO } from "@/lib/voorstel/smileyapp";
import { BRANCHE_LIJST, quotesVoor, type Branche } from "@/lib/voorstel/smileyapp-branches";
import { VERHALEN } from "@/lib/voorstel/smileyapp-klanten";
import { SOORT_SLEUTEL, brancheKeuze, keuzeNaarZoek, type SoortSleutel } from "@/lib/voorstel/smileyapp-samensteller";
import { taalBasis, type Vertaling } from "@/lib/voorstel/smileyapp-taal";
import { TEKSTEN, brancheTaal, type BrancheTekst } from "@/lib/voorstel/smileyapp-talen";
import { vul } from "@/lib/voorstel/smileyapp-teksten";
import { Vinkje } from "@/components/voorstel/smileyapp/Blokken";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";
import { ReviewBlok } from "@/components/voorstel/smileyapp/ReviewBlok";

// De branches en de klantverhalen van het SmileyApp-voorstel in het Engels en
// het Duits (deel 6b): dezelfde opbouw als de Nederlandse pagina's
// (app/voorstel/smileyapp/branches en /klanten), met de teksten uit
// lib/voorstel/smileyapp-talen.ts. De pagina zet lang op de omlijsting en levert
// de kop (h1); hier staat de rest. Wat een voorbeeld is, heet ook hier een
// voorbeeld. Namen van mensen en organisaties blijven zoals ze zijn; op de
// klantverhalen blijven de twee echte quotes in het Nederlands staan, met
// lang="nl" en de regel dat het het origineel is. Server-onderdelen.

/** De donkere strook bovenaan een pagina; `children` is de kop (h1) die de pagina zelf levert. */
export function PaginaHero({ boven, sub, terug, children }: { boven: string; sub?: string; terug?: { label: string; href: string }; children: ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-smiley-ink text-white">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-smiley-green/25 blur-3xl" />
      <Gezicht score={10} kleur="#FDD11A" knipoog className="sm-zweef pointer-events-none absolute -right-10 top-8 h-48 w-48 opacity-25 sm:right-16" />
      <div className="relative mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-24">
        {terug && (
          <Link href={terug.href} className="mb-6 inline-block text-sm font-bold text-smiley-sun hover:underline">
            ← {terug.label}
          </Link>
        )}
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun">{boven}</p>
        {children}
        {sub && <p className="mt-5 max-w-2xl text-xl font-semibold leading-relaxed text-smiley-green">{sub}</p>}
      </div>
    </section>
  );
}

const KAART = ["bg-smiley-sun", "bg-smiley-green", "bg-white ring-1 ring-smiley-ink/10", "bg-smiley-mint", "bg-smiley-sun"] as const;

/** Het overzicht van de branches, onder de hero. */
export function BranchesTaal({ taal }: { taal: Vertaling }) {
  const t = TEKSTEN[taal].branchePagina;
  const b = taalBasis(taal);
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-20">
      <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {BRANCHE_LIJST.map((branche, i) => {
          const tekst = brancheTaal(branche.slug, taal);
          if (!tekst) return null;
          return (
            <li key={branche.slug} className="sm-onthul">
              {/* relative: de verborgen tekst (sr-only) blijft binnen de kaart */}
              <Link href={`${b}/branches/${branche.slug}`} className={`sm-til relative flex h-full flex-col rounded-[2rem] p-7 text-smiley-ink ${KAART[i % KAART.length] ?? KAART[0]}`}>
                <Gezicht score={branche.smiley} kleur="#0E2A20" knipoog className="sm-wiebel h-14 w-14" />
                <h2 className="mt-5 break-words font-display text-3xl font-bold leading-tight [hyphens:auto]">{tekst.naam}</h2>
                <p className="mt-3 leading-relaxed">{tekst.intro[0]}</p>
                <span className="mt-auto pt-6 font-bold">
                  {t.bekijk}
                  <span className="sr-only"> {vul(t.bekijkVoor, { naam: tekst.naam })}</span> →
                </span>
              </Link>
            </li>
          );
        })}
        <li className="sm-onthul">
          <div className="flex h-full flex-col rounded-[2rem] bg-smiley-ink p-7 text-white">
            <h2 className="break-words font-display text-3xl font-bold leading-tight [hyphens:auto]">{t.nietErbij}</h2>
            <p className="mt-3 leading-relaxed text-white/80">{t.nietErbijTekst}</p>
            <Link href={`${b}/demo`} className="mt-auto inline-flex w-fit rounded-full bg-smiley-sun px-6 py-3.5 font-bold text-smiley-ink transition-transform hover:-translate-y-0.5">
              {t.demo}
            </Link>
          </div>
        </li>
      </ul>
    </section>
  );
}

/** Hoe een soort vraag eruitziet voor wie hem invult: alleen een tekening, er valt niets in te vullen. */
function Antwoordvak({ soort, ja, nee }: { soort: SoortSleutel; ja: string; nee: string }) {
  if (soort === "rating") {
    return (
      <div aria-hidden="true" className="mt-3 flex items-center gap-1.5">
        {[2, 4, 6, 8, 10].map((s) => (
          <Gezicht key={s} score={s} className={s === 8 ? "h-9 w-9" : "h-6 w-6 opacity-50"} />
        ))}
        <span className="ml-2 font-display text-xl font-bold">8</span>
      </div>
    );
  }
  if (soort === "janee") {
    return (
      <div aria-hidden="true" className="mt-3 flex gap-2 text-sm font-bold">
        <span className="rounded-full bg-smiley-ink px-4 py-1.5 text-white">{ja}</span>
        <span className="rounded-full px-4 py-1.5 ring-1 ring-smiley-ink/20">{nee}</span>
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="mt-3 space-y-2 rounded-2xl bg-smiley-cream p-3 ring-1 ring-smiley-ink/10">
      <span className="block h-2 w-4/5 rounded-full bg-smiley-ink/15" />
      <span className="block h-2 w-3/5 rounded-full bg-smiley-ink/15" />
    </div>
  );
}

/** Eén branche, onder de hero. `branche`: de Nederlandse gegevens (soorten vragen, smiley), `tekst`: de vertaling. */
export function BrancheTaal({ taal, branche, tekst }: { taal: Vertaling; branche: Branche; tekst: BrancheTekst }) {
  const alles = TEKSTEN[taal];
  const t = alles.branchePagina;
  const b = taalBasis(taal);
  const quotes = quotesVoor(branche.slug);
  const andere = BRANCHE_LIJST.filter((x) => x.slug !== branche.slug);
  return (
    <>
      <section className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <div className="sm-onthul">
          <div className="space-y-4 text-lg leading-relaxed text-smiley-mute">
            {tekst.intro.map((alinea) => (
              <p key={alinea}>{alinea}</p>
            ))}
          </div>
          <p className="mt-6 rounded-2xl bg-white p-5 leading-relaxed ring-1 ring-smiley-ink/10">{alles.hoe.stappen[0]?.tekst}</p>
          {branche.slug === "horeca" && (
            <p className="mt-4 text-sm leading-relaxed text-smiley-mute">
              {t.video}{" "}
              <Link href={`${BASE}#video`} hrefLang="nl" className="font-semibold text-smiley-leaf underline underline-offset-2">
                {vul(t.videoLink, { duur: VIDEO.duur })}
              </Link>
              .
            </p>
          )}
        </div>
        <div className="sm-onthul rounded-[2rem] bg-smiley-mint p-6 sm:p-8">
          <h2 className="break-words font-display text-2xl font-bold [hyphens:auto]">{t.waar}</h2>
          <ul className="mt-5 space-y-3">
            {tekst.momenten.map((m) => (
              <li key={m} className="flex gap-3 font-semibold">
                <Vinkje />
                {m}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="voorbeeld-kop" className="bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <p className="inline-flex rounded-full bg-smiley-sun px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-smiley-ink">{t.voorbeeldLabel}</p>
          <h2 id="voorbeeld-kop" className="mt-4 break-words font-display text-3xl font-bold leading-tight [hyphens:auto] sm:text-4xl md:[hyphens:manual]">
            {vul(t.voorbeeldKop, { naam: tekst.naam })}
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-smiley-mute">{t.voorbeeldUitleg}</p>
          <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {branche.vragen.map((v, i) => {
              const soort = SOORT_SLEUTEL[v.soort];
              return (
                <li key={v.tekst} className="sm-onthul rounded-[2rem] bg-smiley-cream p-6 ring-1 ring-smiley-ink/5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-smiley-ink font-display font-bold text-smiley-sun">{i + 1}</span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-smiley-leaf ring-1 ring-smiley-leaf/20">{alles.samenstel.soorten[soort]}</span>
                  </div>
                  <p className="mt-4 break-words font-display text-lg font-bold leading-snug [hyphens:auto]">{tekst.vragen[i] ?? v.tekst}</p>
                  <Antwoordvak soort={soort} ja={alles.samenstel.ja} nee={alles.samenstel.nee} />
                </li>
              );
            })}
          </ol>
          <Link href={`${b}/samenstellen?${keuzeNaarZoek({ ids: brancheKeuze(branche.slug), eigen: "" })}`} className="mt-8 inline-flex rounded-full px-6 py-3 font-bold text-smiley-ink ring-1 ring-smiley-ink/20 hover:bg-smiley-mint">
            {t.samenstellen}
          </Link>
        </div>
      </section>

      {quotes.length > 0 && (
        <section aria-labelledby="ervaring-kop" className="py-16 lg:py-20">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
            <h2 id="ervaring-kop" className="break-words font-display text-3xl font-bold leading-tight [hyphens:auto] sm:text-4xl">
              {t.ervaring}
            </h2>
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {quotes.map((q) => (
                <figure key={q.naam} className="sm-onthul rounded-[2rem] bg-white p-7 ring-1 ring-smiley-ink/10 sm:p-9">
                  {/* de echte quote blijft in zijn eigen taal */}
                  <blockquote lang="nl" className="space-y-4 text-lg leading-relaxed">
                    {q.tekst.map((alinea) => (
                      <p key={alinea}>{alinea}</p>
                    ))}
                  </blockquote>
                  <figcaption className="mt-7 flex items-center gap-4">
                    <Image src={q.beeld} alt="" width={120} height={120} className="h-14 w-14 rounded-full" />
                    <span>
                      <span className="block font-bold">{q.naam}</span>
                      <span className="block text-sm text-smiley-mute">{q.organisatie}</span>
                      <span className="mt-1 block text-xs font-semibold text-smiley-leaf">{alles.klantenPagina.origineel}</span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
            <Link href={`${b}/klanten`} className="mt-8 inline-flex rounded-full px-6 py-3 font-bold text-smiley-ink ring-1 ring-smiley-ink/20 hover:bg-smiley-mint">
              {alles.klanten.verhalen}
            </Link>
          </div>
        </section>
      )}

      <section className="bg-smiley-sun">
        <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-8">
          <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
            <p className="max-w-2xl font-display text-2xl font-bold leading-snug sm:text-3xl">{t.benieuwd}</p>
            <Link href={`${b}/demo`} className="shrink-0 rounded-full bg-smiley-ink px-8 py-4 font-bold text-white transition-transform hover:-translate-y-0.5">
              {t.demo}
            </Link>
          </div>
          <nav aria-label={t.andere} className="mt-8">
            <ul className="flex flex-wrap gap-2">
              {andere.map((x) => (
                <li key={x.slug}>
                  <Link href={`${b}/branches/${x.slug}`} className="inline-flex rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-smiley-ink hover:bg-white">
                    {brancheTaal(x.slug, taal)?.naam ?? x.naam}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>
    </>
  );
}

/** De klantverhalen, onder de hero: de quote blijft Nederlands, de uitwerking eromheen is vertaald. */
export function KlantenTaal({ taal }: { taal: Vertaling }) {
  const alles = TEKSTEN[taal];
  const t = alles.klantenPagina;
  const b = taalBasis(taal);
  return (
    <>
      {/* Reviews die het team zelf invoerde, met vertaalde kop en voetregel; zonder zichtbare review staat hier niets */}
      <ReviewBlok taal={taal} />

      <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-16 sm:px-8 lg:py-20">
        {VERHALEN.map((v, i) => {
          const tekst = Object.hasOwn(t.verhalen, v.id) ? t.verhalen[v.id] : undefined;
          return (
            <article key={v.id} id={v.id} aria-labelledby={`${v.id}-kop`} className="sm-onthul scroll-mt-24 overflow-hidden rounded-[2rem] bg-white ring-1 ring-smiley-ink/10">
              <div className={`grid lg:grid-cols-[1fr_1.4fr] ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}>
                <div className={`flex flex-col gap-6 p-7 sm:p-10 ${i % 2 === 1 ? "bg-smiley-sun" : "bg-smiley-mint"}`}>
                  {v.klant && (
                    <a href={v.klant.url} target="_blank" rel="noopener noreferrer" className="grid h-24 w-full max-w-[240px] place-items-center rounded-3xl bg-white p-4 ring-1 ring-smiley-ink/10">
                      <Image src={v.klant.beeld} alt={`${v.klant.naam} ${alles.klanten.nieuwVenster}`} width={v.klant.breed} height={v.klant.hoog} className="max-h-16 w-auto object-contain" />
                    </a>
                  )}
                  <div>
                    <h2 id={`${v.id}-kop`} lang="nl" className="break-words font-display text-3xl font-bold leading-tight sm:text-4xl">
                      {v.organisatie}
                    </h2>
                    {/* zonder vertaling blijft de Nederlandse tekst staan, met de taal erbij */}
                    <p className="mt-3 leading-relaxed" {...(tekst ? {} : { lang: "nl" })}>
                      {tekst?.gebruik ?? v.gebruik}
                    </p>
                  </div>
                  {(tekst?.eerst ?? v.eerst) && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-[0.2em]">{t.eerst}</h3>
                      <p className="mt-2 leading-relaxed" {...(tekst?.eerst ? {} : { lang: "nl" })}>
                        {tekst?.eerst ?? v.eerst}
                      </p>
                    </div>
                  )}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em]">{t.meten}</h3>
                    <ul className="mt-3 space-y-2.5" {...(tekst ? {} : { lang: "nl" })}>
                      {(tekst?.meten ?? v.meten).map((m) => (
                        <li key={m} className="flex gap-3 font-semibold">
                          <Vinkje />
                          {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <figure className="relative p-7 sm:p-10">
                  <span aria-hidden="true" className="absolute right-7 top-4 font-display text-8xl font-bold leading-none text-smiley-green/40">
                    &rdquo;
                  </span>
                  {/* de echte quote van smileyapp.nl, letterlijk en in zijn eigen taal */}
                  <blockquote lang="nl" className="relative space-y-4 text-lg leading-relaxed sm:text-xl">
                    {v.quote.map((alinea) => (
                      <p key={alinea}>{alinea}</p>
                    ))}
                  </blockquote>
                  <figcaption className="mt-8 flex items-center gap-4">
                    <Image src={v.beeld} alt="" width={120} height={120} className="h-16 w-16 rounded-full" />
                    <span>
                      <span className="block font-bold">{v.naam}</span>
                      <span className="block text-sm text-smiley-mute">{v.organisatie}</span>
                      <span className="mt-1 block text-xs font-semibold text-smiley-leaf">{t.origineel}</span>
                    </span>
                  </figcaption>
                </figure>
              </div>
            </article>
          );
        })}
      </div>

      <section aria-labelledby="case-kop" className="bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <h2 id="case-kop" className="break-words font-display text-3xl font-bold leading-tight [hyphens:auto] sm:text-4xl">
            {t.klantenKop}
          </h2>
          <ul className="sm-onthul mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {KLANTEN.map((k) => (
              <li key={k.naam}>
                <a href={k.url} target="_blank" rel="noopener noreferrer" className="sm-til grid h-28 place-items-center rounded-3xl bg-smiley-cream p-5 ring-1 ring-smiley-ink/10 hover:ring-smiley-green">
                  <Image src={k.beeld} alt={`${k.naam} ${alles.klanten.nieuwVenster}`} width={k.breed} height={k.hoog} className="max-h-16 w-auto object-contain" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-smiley-sun">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 px-4 py-14 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <p className="max-w-2xl font-display text-2xl font-bold leading-snug sm:text-3xl">{t.slot}</p>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link href={`${b}/demo`} className="rounded-full bg-smiley-ink px-8 py-4 font-bold text-white transition-transform hover:-translate-y-0.5">
              {alles.branchePagina.demo}
            </Link>
            <Link href={`${b}/branches/onderwijs`} className="rounded-full px-8 py-4 font-bold text-smiley-ink ring-2 ring-smiley-ink transition-transform hover:-translate-y-0.5">
              {t.onderwijs}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
