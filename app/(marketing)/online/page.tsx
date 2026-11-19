import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FaqList } from "@/components/marketing/primitives";
import { ToolMerk } from "@/components/marketing/online/ToolMerk";
import { BUNDEL_TLDS, euroPrijs, extensie } from "@/lib/domeinen/extensies";
import { LOGO_VOORBEELDEN } from "@/lib/logo/voorbeelden";
import { ALLE_ONLINE_TOOLS, ONLINE_FAQ, ONLINE_GROEPEN, VERGELIJK, WAAROM_HIER, ZO_WERKT_HET, type OnlineTool } from "@/lib/marketing/online-tools";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { VOORBEELDEN } from "@/lib/website/aanvraag-opties";

const DESCRIPTION = "Website maken, webshop openen, logo ontwerpen, domeinnaam registreren, verhuizen of beheren, zakelijke e-mail, gratis checks en meer. Alle online tools van ZekerFlex op één pagina, eerst zien en dan betalen.";

export const metadata: Metadata = {
  title: "Alles voor je bedrijf online",
  description: DESCRIPTION,
  ...canonical("/online"),
};

// /online (19 nov 2026, eigenaar): alle losse online tools op één pagina, als de startpagina van een websitebouwer maar
// in onze eigen stijl en met eigen logo's per tool ("geen een heeft een mooi eigen logo, veel te basic"). Elke tool heeft
// een eigen merkteken (lib/marketing/online-merken.ts), een echt beeld waar we er een hebben, en een knop die meteen doet
// wat hij zegt. De logo's in de kaart "Logo maker" zijn de echte voorbeelden van de logo maker (verzonnen merken, staat erbij).
// Geen verzonnen aantallen of sterren; de domeinprijzen komen uit lib/domeinen/extensies.ts.

const START = "/website-maken";
const logoVoorbeeld = (sleutel: string) => `/api/logo-maker/voorbeeld/${sleutel}?thema=donker`;

function Knop({ t, className = "btn-primary px-4 py-2 text-sm" }: { t: OnlineTool; className?: string }) {
  return t.extern ? (
    <a href={t.href} target="_blank" rel="noopener noreferrer" className={className}>
      {t.knop}
    </a>
  ) : (
    <Link href={t.href} className={className}>
      {t.knop}
    </Link>
  );
}

function Etiket({ tekst, donker = false }: { tekst: string; donker?: boolean }) {
  const gratis = /gratis/i.test(tekst);
  const kleur = donker
    ? "border-white/15 bg-white/10 text-white"
    : gratis
      ? "border-brand-mint/40 bg-mintwash text-brand-700"
      : "border-money/30 bg-money-soft text-money-ink";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${kleur}`}>{tekst}</span>;
}

/** De gewone kaart: eigen logo, naam, uitleg, etiket of prijs, en de knop. */
function ToolKaart({ t, donker = false }: { t: OnlineTool; donker?: boolean }) {
  return (
    <li className={donker ? "surface-hover flex flex-col gap-4 rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-6 text-white" : "surface surface-hover flex flex-col gap-4 p-6"}>
      <div className="flex items-start justify-between gap-3">
        <ToolMerk sleutel={t.sleutel} maat={56} />
        {t.etiket ? <Etiket tekst={t.etiket} donker={donker} /> : null}
      </div>
      <div className="flex-1">
        <h4 className={`font-display text-xl font-bold leading-tight ${donker ? "text-white" : "text-ink"}`}>{t.naam}</h4>
        <p className={`mt-2 text-sm leading-relaxed ${donker ? "text-white/70" : "text-neutralx-600"}`}>{t.kort}</p>
        {t.prijs ? <p className={`mt-3 text-xs font-semibold ${donker ? "text-brand-mint" : "text-brand-700"}`}>{t.prijs}</p> : null}
      </div>
      <Knop t={t} className={donker ? "btn-mint px-4 py-2 text-sm" : "btn-primary px-4 py-2 text-sm"} />
    </li>
  );
}

/** De grote kaart (Maken, Apps): met het echte beeld van het product bovenin. */
function GroteKaart({ t }: { t: OnlineTool }) {
  return (
    <li className="surface surface-hover flex flex-col overflow-hidden">
      {/* lichte ondergrond terwijl een foto laadt (een zwart vlak oogt kapot); de logokaart is bewust donker, zoals de logo maker zelf */}
      <div className={`relative aspect-[16/9] ${t.sleutel === "logo-maker" ? "bg-[#0B0B0C]" : "bg-paper-soft"}`}>
        {t.sleutel === "logo-maker" ? (
          <ul className="grid h-full grid-cols-3 gap-px bg-white/10" aria-label="Voorbeelden van logo's uit de logo maker, voor verzonnen merken">
            {LOGO_VOORBEELDEN.slice(0, 3).map((v) => (
              <li key={v.sleutel} className="relative flex items-center justify-center overflow-hidden bg-[#0B0B0C] p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoVoorbeeld(v.sleutel)} alt={`Voorbeeldlogo voor het verzonnen merk ${v.invoer.naam}`} width={640} height={480} loading="lazy" className="block max-h-full w-full object-contain" />
              </li>
            ))}
          </ul>
        ) : t.beeld ? (
          <Image src={t.beeld.src} alt={t.beeld.alt} fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover object-top" />
        ) : null}
        <div className="absolute left-4 top-4">
          <ToolMerk sleutel={t.sleutel} maat={52} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-display text-2xl font-bold leading-tight text-ink">{t.naam}</h4>
          {t.etiket ? <Etiket tekst={t.etiket} /> : null}
        </div>
        <p className="flex-1 text-[0.95rem] leading-relaxed text-neutralx-600">{t.kort}</p>
        {t.prijs ? <p className="text-xs font-semibold text-brand-700">{t.prijs}</p> : null}
        <div>
          <Knop t={t} className="btn-primary px-5 py-2.5 text-sm" />
        </div>
      </div>
    </li>
  );
}

export default function OnlinePagina() {
  const groep = (s: (typeof ONLINE_GROEPEN)[number]["sleutel"]) => ONLINE_GROEPEN.find((g) => g.sleutel === s);
  const maken = groep("maken");
  const domein = groep("domein");
  const checks = groep("checks");
  const groeien = groep("groeien");
  const apps = groep("apps");
  const hoofdfoto = VOORBEELDEN[0];
  const kleineFotos = VOORBEELDEN.slice(1, 4);
  const bundel = BUNDEL_TLDS.map((tld) => extensie(tld)).filter((e): e is NonNullable<typeof e> => Boolean(e));

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbJsonLd([["Home", "/"], ["Alles voor je bedrijf online", "/online"]])) }} />

      {/* kop: belofte, twee knoppen, en rechts een browservenster met de echte voorbeelden */}
      <section className="hero-ink relative overflow-hidden text-white">
        <div className="shell grid gap-12 py-16 md:py-24 lg:grid-cols-[1fr_minmax(0,34rem)] lg:items-center lg:gap-16">
          <div className="relative z-10">
            <p className="eyebrow text-brand-mint">Alles voor je bedrijf online</p>
            <h1 className="mt-4 text-balance font-display text-5xl font-bold leading-[1.02] md:text-7xl">
              Website, webshop, logo en domein. <span className="text-brand-mint">Eerst zien, dan betalen.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75 md:text-xl">
              {ALLE_ONLINE_TOOLS.length} tools om je bedrijf online te zetten, op één plek. Je kiest wat je nu nodig hebt, ziet meteen resultaat en betaalt alleen voor wat je afneemt.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={START} className="btn-mint px-7 py-3.5 text-base">
                Begin met je website
              </Link>
              <a href="#tools" className="btn-ghost-invert px-7 py-3.5 text-base">
                Bekijk alle tools
              </a>
            </div>
            {/* de merken van de eerste zes tools, als bewijs dat het echte, eigen tools zijn */}
            <ul className="mt-10 flex flex-wrap items-center gap-3" aria-label="Een paar van de tools">
              {ALLE_ONLINE_TOOLS.slice(0, 8).map((t) => (
                <li key={t.sleutel}>
                  <Link href={t.href} title={t.naam} className="block transition-transform hover:-translate-y-1">
                    <ToolMerk sleutel={t.sleutel} maat={44} />
                  </Link>
                </li>
              ))}
              <li className="text-sm text-white/55">en meer</li>
            </ul>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute -inset-10 rounded-full bg-brand-mint/10 blur-3xl" aria-hidden="true" />
            {/* browservenster met de website die we echt maakten */}
            <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#15181F] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" aria-hidden="true" />
                <span className="ml-3 flex-1 truncate rounded-md bg-white/10 px-3 py-1 font-mono text-[11px] text-white/60">{hoofdfoto?.href.replace("https://", "")}</span>
              </div>
              {hoofdfoto ? (
                <div className="relative aspect-[16/10]">
                  <Image src={hoofdfoto.foto} alt={`${hoofdfoto.naam}, gemaakt door ZekerFlex`} fill priority sizes="(min-width: 1024px) 34rem, 100vw" className="object-cover object-top" />
                </div>
              ) : null}
            </div>
            {/* drie kleinere vensters eroverheen */}
            <ul className="mt-4 grid grid-cols-3 gap-3" aria-label="Meer websites en apps die we maakten">
              {kleineFotos.map((v) => (
                <li key={v.id} className="overflow-hidden rounded-xl border border-white/15 bg-[#15181F] shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)]">
                  <div className="relative aspect-[4/3]">
                    <Image src={v.foto} alt={`${v.naam}, gemaakt door ZekerFlex`} fill sizes="12rem" className="object-cover object-top" />
                  </div>
                  <p className="px-2.5 py-1.5 text-[11px] font-semibold text-white/80">{v.naam}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* alle tools in één oogopslag: de merken als tegels, elke tegel een link */}
      <section id="tools" className="scroll-mt-24 border-b border-hair bg-white" aria-labelledby="tools-kop">
        <div className="shell py-12 md:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Alle tools</p>
              <h2 id="tools-kop" className="mt-3 font-display text-3xl font-bold text-ink md:text-4xl">
                Kies wat je nu nodig hebt
              </h2>
            </div>
            <p className="max-w-md text-sm text-neutralx-600">Allemaal van onszelf, allemaal op onze eigen servers. Tik op een tegel en je bent er.</p>
          </div>
          <ul className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9" aria-label="Alle online tools">
            {ALLE_ONLINE_TOOLS.map((t) => (
              <li key={t.sleutel}>
                <Link
                  href={t.href}
                  {...(t.extern ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="group flex h-full flex-col items-center gap-2 rounded-2xl border border-hair bg-paper px-2 py-4 text-center transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-e2"
                >
                  <ToolMerk sleutel={t.sleutel} maat={52} className="transition-transform group-hover:scale-105" />
                  <span className="text-[12px] font-semibold leading-tight text-ink">{t.naam}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* maken: de vier grote kaarten met echte beelden */}
      {maken ? (
        <section id={maken.sleutel} className="scroll-mt-24 bg-paper" aria-labelledby="maken-kop">
          <div className="shell py-14 md:py-20">
            <p className="eyebrow">{maken.titel}</p>
            <h2 id="maken-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-5xl">
              {maken.kop}
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-neutralx-600">{maken.intro}</p>
            <ul className="mt-10 grid gap-6 md:grid-cols-2">
              {maken.tools.map((t) => (
                <GroteKaart key={t.sleutel} t={t} />
              ))}
            </ul>
            <p className="mt-4 text-xs text-neutralx-600">De logo&apos;s in de kaart Logo maker zijn voorbeelden voor verzonnen merken, om te laten zien wat de logo maker maakt.</p>
          </div>
        </section>
      ) : null}

      {/* domein & e-mail: donkere band met de echte prijzen van de bundel-extensies */}
      {domein ? (
        <section id={domein.sleutel} className="scroll-mt-24 bg-[#0C0E12] text-white" aria-labelledby="domein-kop">
          <div className="shell py-14 md:py-20">
            <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-end">
              <div>
                <p className="eyebrow text-brand-mint">{domein.titel}</p>
                <h2 id="domein-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight md:text-5xl">
                  {domein.kop}
                </h2>
                <p className="mt-4 max-w-2xl text-lg text-white/70">{domein.intro}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Eerste jaar, excl. btw</p>
                <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
                  {bundel.map((e) => (
                    <li key={e.tld} className="flex items-baseline justify-between border-b border-white/10 pb-2 font-mono text-sm">
                      <span className="font-semibold text-white">.{e.tld}</span>
                      <span className="text-white/75">{euroPrijs(e.prijsCent)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-white/55">Bij een website of webshop van ons is het eerste jaar inbegrepen.</p>
              </div>
            </div>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {domein.tools.map((t) => (
                <ToolKaart key={t.sleutel} t={t} donker />
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* gratis checks */}
      {checks ? (
        <section id={checks.sleutel} className="scroll-mt-24 bg-white" aria-labelledby="checks-kop">
          <div className="shell py-14 md:py-20">
            <p className="eyebrow">{checks.titel}</p>
            <h2 id="checks-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-5xl">
              {checks.kop}
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-neutralx-600">{checks.intro}</p>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {checks.tools.map((t) => (
                <ToolKaart key={t.sleutel} t={t} />
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* gevonden en bereikbaar */}
      {groeien ? (
        <section id={groeien.sleutel} className="scroll-mt-24 bg-paper" aria-labelledby="groeien-kop">
          <div className="shell py-14 md:py-20">
            <p className="eyebrow">{groeien.titel}</p>
            <h2 id="groeien-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-5xl">
              {groeien.kop}
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-neutralx-600">{groeien.intro}</p>
            <ul className="mt-10 grid gap-5 md:grid-cols-3">
              {groeien.tools.map((t) => (
                <ToolKaart key={t.sleutel} t={t} />
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* apps */}
      {apps ? (
        <section id={apps.sleutel} className="scroll-mt-24 bg-white" aria-labelledby="apps-kop">
          <div className="shell py-14 md:py-20">
            <p className="eyebrow">{apps.titel}</p>
            <h2 id="apps-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-5xl">
              {apps.kop}
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-neutralx-600">{apps.intro}</p>
            <ul className="mt-10 grid gap-6 md:grid-cols-2">
              {apps.tools.map((t) => (
                <GroteKaart key={t.sleutel} t={t} />
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* vergelijking met een gewone websitebouwer */}
      <section className="bg-paper" aria-labelledby="vergelijk-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Het verschil</p>
          <h2 id="vergelijk-kop" className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-ink md:text-5xl">
            Meer dan een websitebouwer
          </h2>
          <div className="surface mt-10 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hair bg-paper-soft text-xs uppercase tracking-[0.14em] text-neutralx-600">
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Wat
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Een gewone websitebouwer
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold text-brand-700">
                    ZekerFlex
                  </th>
                </tr>
              </thead>
              <tbody>
                {VERGELIJK.map((r) => (
                  <tr key={r.punt} className="border-b border-hair last:border-0">
                    <th scope="row" className="px-5 py-4 align-top font-display text-base font-bold text-ink">
                      {r.punt}
                    </th>
                    <td className="px-5 py-4 align-top text-neutralx-600">{r.bouwer}</td>
                    <td className="px-5 py-4 align-top font-medium text-ink">
                      <span className="mr-2 text-brand-500" aria-hidden="true">
                        ✓
                      </span>
                      {r.wij}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* zo werkt het */}
      <section className="bg-white" aria-labelledby="werkt-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Zo werkt het</p>
          <h2 id="werkt-kop" className="mt-3 font-display text-3xl font-bold text-ink md:text-5xl">
            Drie stappen, geen verrassingen
          </h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {ZO_WERKT_HET.map((s, i) => (
              <li key={s.titel} className="surface p-6">
                <span className="num inline-grid h-11 w-11 place-items-center rounded-full bg-ink font-display text-lg font-bold text-white">{i + 1}</span>
                <h3 className="mt-4 font-display text-xl font-bold text-ink">{s.titel}</h3>
                <p className="mt-2 text-neutralx-600">{s.tekst}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* waarom hier */}
      <section className="bg-paper" aria-labelledby="waarom-kop">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow">Waarom hier</p>
          <h2 id="waarom-kop" className="mt-3 font-display text-3xl font-bold text-ink md:text-5xl">
            Wat je bij ons wel krijgt
          </h2>
          <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {WAAROM_HIER.map((w) => (
              <li key={w.titel} className="rounded-2xl border border-hair bg-white p-6">
                <span className="mb-4 inline-grid h-9 w-9 place-items-center rounded-full bg-mintwash text-brand-700" aria-hidden="true">
                  ✓
                </span>
                <h3 className="font-display text-lg font-bold text-ink">{w.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{w.tekst}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* vragen */}
      <section className="bg-white" aria-labelledby="faq-kop">
        <div className="shell py-14 md:py-20">
          <h2 id="faq-kop" className="font-display text-3xl font-bold text-ink md:text-5xl">
            Veelgestelde vragen
          </h2>
          <div className="mt-8 max-w-3xl">
            <FaqList items={ONLINE_FAQ} />
          </div>
        </div>
      </section>

      {/* slot */}
      <section className="hero-ink text-white" aria-labelledby="begin-kop">
        <div className="shell grid gap-10 py-16 md:py-24 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h2 id="begin-kop" className="text-balance font-display text-3xl font-bold md:text-5xl">
              Begin vandaag, betaal pas als het goed is
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-white/75">
              Vertel je wensen voor een website of webshop en krijg binnen een dag een voorbeeld in drie versies. Of begin klein: een logo, een domeinnaam of een gratis check.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={START} className="btn-mint px-7 py-3.5 text-base">
              Vertel je wensen
            </Link>
            <a href="#tools" className="btn-ghost-invert px-7 py-3.5 text-base">
              Alle tools
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
