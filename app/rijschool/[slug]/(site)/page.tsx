import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { laadRijschool, linkBasis } from "@/lib/rijschool/pagina";
import { sitePad } from "@/lib/rijschool/domein-pad";
import { websiteVan, whatsappNummer } from "@/lib/rijschool/website";
import { ldJson } from "@/lib/seo/json-ld";
import { euro } from "@/lib/payroll/format";
import { siteUrl } from "@/lib/rijschool/mail";
import { winkelLink } from "@/lib/play/api";
import { Stuur } from "@/components/rijschool/site/Stuur";
import { telefoonWeergave } from "@/lib/rijschool/format";
import { heldfotoUrl } from "@/lib/rijschool/heldfoto";
import { eigenAdres } from "@/lib/rijschool/domein";
import { deelbeeldUrl } from "@/lib/rijschool/deelbeeld";
import { SITE } from "@/lib/seo";

export const dynamic = "force-dynamic";

// De homepagina van een rijschool, in de ZekerFlex-huisstijl (zoals
// schwarzwald.zekerflex.com): donkere hero met grote kop, een tickerband, witte
// kaarten op crème, genummerde stappen, de app, vragen en een CTA-band. Alle
// teksten komen uit het beheer (lib/rijschool/website.ts), pakketten en
// instructeurs uit de database, kleuren van de rijschool (lib/rijschool/kleuren.ts).

const STAPPEN = [
  { titel: "Proefles", tekst: "Je rijdt een eerste keer en krijgt een eerlijke inschatting van het aantal lessen." },
  { titel: "Vaste instructeur", tekst: "Je lessen plan je samen; de bevestiging krijg je per mail." },
  { titel: "Voortgang in de app", tekst: "Na elke les zie je per onderdeel waar je staat en wat je huiswerk is." },
  { titel: "Examen", tekst: "Als alles op examenniveau is, plannen we samen je praktijkexamen." },
];

const APP_FUNCTIES = ["Je lessen en ophaaladres", "Voortgang per onderdeel na elke les", "Huiswerk en uitleg", "Theorie oefenen", "Tegoed en betalen"];

const label = "text-xs font-bold uppercase tracking-[0.18em]";
const knopAccent = { background: "var(--rs-accent-knop)", color: "var(--rs-op-accent)" };

export default async function RijschoolHome({ params }: { params: Promise<{ slug: string }> }) {
  const r = await laadRijschool((await params).slug);
  if (!r) notFound();
  const w = websiteVan(r.website, r);
  const wa = whatsappNummer(w.whatsapp);
  const basis = await linkBasis(r.id, r.slug);
  const [producten, instructeurs, playApp, foto, eigen, beeld] = await Promise.all([
    prisma.rijschoolProduct.findMany({ where: { rijschoolId: r.id, zichtbaar: true }, orderBy: [{ volgorde: "asc" }, { createdAt: "asc" }] }),
    prisma.rijschoolInstructeur.findMany({ where: { rijschoolId: r.id, actief: true }, select: { id: true, naam: true, bio: true, categorieen: true }, orderBy: { createdAt: "asc" } }),
    prisma.rijschoolApp.findUnique({ where: { rijschoolId: r.id }, select: { pakketnaam: true, liveSinds: true } }).catch(() => null),
    heldfotoUrl(r),
    eigenAdres(r.id),
    deelbeeldUrl(r),
  ]);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const ld = {
    "@context": "https://schema.org",
    "@type": "DrivingSchool",
    name: r.naam,
    url: eigen ? `${eigen}/` : siteUrl(r),
    image: `${eigen ?? SITE.url}${beeld}`,
    ...(r.telefoon ? { telephone: r.telefoon } : {}),
    ...(r.email ? { email: r.email } : {}),
    ...(r.adres || r.plaats ? { address: { "@type": "PostalAddress", streetAddress: r.adres, addressLocality: r.plaats, addressCountry: "NL" } } : {}),
    ...(w.werkgebied.length ? { areaServed: w.werkgebied } : {}),
    ...(producten.length
      ? { makesOffer: producten.map((p) => ({ "@type": "Offer", name: p.naam, price: (p.prijsCent / 100).toFixed(2), priceCurrency: "EUR" })) }
      : {}),
  };
  const ticker = w.werkgebied.length >= 3 ? w.werkgebied : ["Proefles", "Vaste instructeur", "Voortgang in de app", "Theorie oefenen", "Examentraining", ...(r.plaats ? [r.plaats] : [])];
  const goedkoopste = producten.filter((p) => p.lessen > 1).map((p) => Math.round(p.prijsCent / p.lessen)).sort((a, b) => a - b)[0];

  return (
    <>
      {r.online && <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />}

      {/* Hero */}
      <section className="relative overflow-hidden text-schw-cream" style={{ background: "var(--rs-nacht)" }}>
        {foto && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- eigen, al opgeschoonde WebP (lib/rijschool/heldfoto.ts) */}
            <img src={foto} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
            {/* donkere laag: tekst blijft leesbaar op elke foto; links (waar de tekst staat) het donkerst */}
            <div aria-hidden="true" className="absolute inset-0 opacity-80" style={{ background: "var(--rs-nacht)" }} />
            <div aria-hidden="true" className="absolute inset-0 hidden lg:block" style={{ background: "linear-gradient(90deg, var(--rs-nacht) 0%, transparent 65%)" }} />
          </>
        )}
        <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-10 h-[420px] w-[420px] animate-aurora-drift rounded-full opacity-30 blur-3xl" style={{ background: "var(--rs-accent)" }} />
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-0 h-[380px] w-[380px] animate-aurora-drift rounded-full opacity-40 blur-3xl [animation-delay:-6s]" style={{ background: "var(--rs-kleur)" }} />
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-4 pb-24 pt-12 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pb-32 lg:pt-20">
          <div className="animate-fade-up">
            <p className={label} style={{ color: "var(--rs-accent-op-nacht)" }}>
              Rijschool{r.plaats ? ` in ${r.plaats}` : ""}
            </p>
            <h1 className="mt-4 font-display text-[clamp(2.6rem,7vw,5.5rem)] font-bold leading-[0.95] tracking-[-0.03em]">{w.kop}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-schw-cream/80">{w.intro}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              {r.proeflesOnline && (
                <Link href={sitePad(basis, "/proefles")} className="rounded-full px-7 py-4 font-bold shadow-[0_14px_40px_-12px_rgba(0,0,0,0.6)] transition-transform hover:-translate-y-0.5" style={knopAccent}>
                  Plan je proefles
                </Link>
              )}
              <a href="#pakketten" className="rounded-full border border-white/25 px-7 py-4 font-semibold transition-colors hover:bg-white/10">
                Bekijk pakketten
              </a>
              {wa && (
                <a href={`https://wa.me/${wa}`} rel="noopener" className="rounded-full border border-white/25 px-7 py-4 font-semibold transition-colors hover:bg-white/10">
                  WhatsApp ons
                </a>
              )}
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-schw-cream/80">
              {w.slagingspercentage !== null && (
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--rs-accent)" }} aria-hidden />
                  <strong className="text-schw-cream">{w.slagingspercentage}%</strong> slaagt in één keer
                </li>
              )}
              {goedkoopste !== undefined && (
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--rs-accent)" }} aria-hidden />
                  Lessen vanaf <strong className="text-schw-cream">{euro(goedkoopste)}</strong>
                </li>
              )}
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--rs-accent)" }} aria-hidden />
                Je voortgang in de app
              </li>
            </ul>
          </div>

          {/* Hoe de app eruitziet: dezelfde onderdelen als de echte leerling-app */}
          <div className="relative mx-auto aspect-square w-full max-w-[520px]" aria-hidden="true">
            <Stuur className="absolute -right-10 -top-6 h-[78%] w-[78%] animate-[spin_60s_linear_infinite] text-white/[0.07]" naaf="transparent" />
            <div className="absolute inset-[8%_14%_6%_14%] -rotate-3 rounded-[2.4rem] bg-schw-cream p-5 text-schw-night shadow-2xl ring-8 ring-black/30">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: "var(--rs-kleur-knop)", color: "var(--rs-op-kleur)" }}>
                  <Stuur className="h-6 w-6" />
                </span>
                <span className="truncate font-display text-sm font-bold">{r.naam}</span>
              </div>
              <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--rs-kleur-knop)", color: "var(--rs-op-kleur)" }}>
                <p className="text-xs opacity-80">Volgende les</p>
                <p className="mt-1 font-display text-lg font-bold">Donderdag 10:00</p>
                <p className="text-xs opacity-80">Ophalen: thuis</p>
              </div>
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-schw-mute">Voortgang</p>
              {[
                ["Voorrang", 80],
                ["Rotondes", 60],
                ["Snelweg", 35],
              ].map(([naam, p]) => (
                <div key={naam} className="mt-2">
                  <div className="flex justify-between text-xs">
                    <span>{naam}</span>
                    <span className="num">{p}%</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-schw-night/10">
                    <div className="h-2 rounded-full" style={{ width: `${p}%`, background: "var(--rs-kleur)" }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute bottom-[4%] right-0 w-[46%] rotate-[5deg] animate-float rounded-3xl bg-white p-4 text-schw-night shadow-2xl">
              <p className="text-xs text-schw-mute">Huiswerk</p>
              <p className="mt-1 text-sm font-semibold">Oefen het invoegen op de snelweg</p>
            </div>
          </div>
        </div>
      </section>

      {/* Tickerband */}
      <div className="relative z-10 -mt-12 overflow-hidden py-6" aria-hidden="true">
        <div className="-mx-10 -rotate-2 py-4 shadow-xl" style={{ background: "var(--rs-accent-knop)", color: "var(--rs-op-accent)" }}>
          <div className="flex w-max animate-ticker gap-8 whitespace-nowrap font-display text-2xl font-bold uppercase sm:text-3xl">
            {[...ticker, ...ticker, ...ticker].map((t, i) => (
              <span key={`${t}-${i}`} className="flex items-center gap-8">
                {t}
                <span>✦</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Waarom wij */}
      {w.sterkePunten.length > 0 && (
        <section className="mx-auto max-w-[1280px] px-4 pt-16 sm:px-8">
          <p className={label} style={{ color: "var(--rs-kleur-tekst)" }}>
            Waarom {r.naam}
          </p>
          <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold tracking-tight sm:text-5xl">Leren rijden zoals het hoort</h2>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {w.sterkePunten.slice(0, 8).map((p, i) => (
              <li key={p.titel} className="rounded-xl3 bg-white p-6 shadow-[0_20px_50px_-30px_rgba(10,18,14,0.35)]">
                <span className="grid h-11 w-11 place-items-center rounded-2xl font-display text-lg font-bold" style={i % 2 ? knopAccent : { background: "var(--rs-kleur-knop)", color: "var(--rs-op-kleur)" }}>
                  {i + 1}
                </span>
                <p className="mt-4 font-display text-lg font-bold">{p.titel}</p>
                <p className="mt-2 text-sm leading-relaxed text-schw-mute">{p.tekst}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Pakketten */}
      {producten.length > 0 && (
        <section id="pakketten" className="mx-auto max-w-[1280px] scroll-mt-24 px-4 pt-24 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className={label} style={{ color: "var(--rs-kleur-tekst)" }}>
                Pakketten en prijzen
              </p>
              <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Kies wat bij je past</h2>
            </div>
            <p className="max-w-sm text-sm text-schw-mute">Alle prijzen inclusief btw. Je tegoed zie je altijd in de app.</p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {producten.map((p) => (
              <article
                key={p.id}
                className={`relative flex flex-col rounded-xl3 p-7 shadow-[0_20px_50px_-30px_rgba(10,18,14,0.35)] ${p.populair ? "text-schw-cream" : "bg-white"}`}
                style={p.populair ? { background: "var(--rs-nacht)" } : undefined}
              >
                {p.populair && (
                  <span className="absolute -top-3 left-7 rounded-full px-3 py-1 text-xs font-bold" style={knopAccent}>
                    Meest gekozen
                  </span>
                )}
                <h3 className="font-display text-xl font-bold">{p.naam}</h3>
                <p className="num mt-3 font-display text-4xl font-bold tracking-tight">{euro(p.prijsCent)}</p>
                {p.lessen > 1 && <p className={`text-sm ${p.populair ? "text-schw-cream/80" : "text-schw-mute"}`}>{euro(Math.round(p.prijsCent / p.lessen))} per les</p>}
                <p className={`mt-4 flex-1 text-sm leading-relaxed ${p.populair ? "text-schw-cream/80" : "text-schw-mute"}`}>{p.omschrijving}</p>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {p.lessen > 0 && (
                    <li>
                      ✓ {p.lessen} {p.lessen === 1 ? "les" : "lessen"} van {p.lesMinuten} minuten
                    </li>
                  )}
                  {p.examen && <li>✓ Inclusief praktijkexamen</li>}
                  {p.lessen > 0 && <li>✓ Voortgang en huiswerk in de app</li>}
                </ul>
                {r.proeflesOnline && (
                  <Link
                    href={sitePad(basis, "/proefles")}
                    className="mt-6 rounded-full px-5 py-3 text-center text-sm font-bold"
                    style={p.populair ? knopAccent : { background: "var(--rs-kleur-knop)", color: "var(--rs-op-kleur)" }}
                  >
                    Begin met een proefles
                  </Link>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Zo werkt het */}
      <section id="werkwijze" className="mt-24 scroll-mt-24 text-schw-cream" style={{ background: "var(--rs-nacht)" }}>
        <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-8">
          <p className={label} style={{ color: "var(--rs-accent-op-nacht)" }}>
            Zo werkt het
          </p>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Van proefles tot rijbewijs</h2>
          <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STAPPEN.map((s, i) => (
              <li key={s.titel}>
                <span className="font-display text-6xl font-bold leading-none" style={{ color: "var(--rs-accent-op-nacht)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="mt-4 font-display text-xl font-bold">{s.titel}</p>
                <p className="mt-2 text-sm leading-relaxed text-schw-cream/80">{s.tekst}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* De app */}
      <section className="mx-auto grid max-w-[1280px] gap-10 px-4 pt-24 sm:px-8 lg:grid-cols-2 lg:items-center">
        <div>
          <p className={label} style={{ color: "var(--rs-kleur-tekst)" }}>
            De app
          </p>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Je rijopleiding in je broekzak</h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-schw-mute">
            Na elke les zet je instructeur je voortgang in de app. Zo weet je precies waar je staat, wat je huiswerk is en hoeveel lessen je nog hebt.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={sitePad(basis, "/inloggen")} className="rounded-full px-6 py-3.5 font-bold" style={{ background: "var(--rs-kleur-knop)", color: "var(--rs-op-kleur)" }}>
              Inloggen in de app
            </Link>
            {playApp?.liveSinds && (
              <a href={winkelLink(playApp.pakketnaam)} rel="noopener" className="inline-flex items-center gap-2 rounded-full bg-schw-night px-6 py-3.5 font-bold text-schw-cream">
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill="currentColor">
                  <path d="M6 4l14 8-14 8z" />
                </svg>
                Download in Google Play
              </a>
            )}
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {APP_FUNCTIES.map((f) => (
            <li key={f} className="flex items-center gap-3 rounded-2xl bg-white p-4 font-semibold shadow-[0_20px_50px_-35px_rgba(10,18,14,0.35)]">
              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-sm" style={knopAccent} aria-hidden>
                ✓
              </span>
              {f}
            </li>
          ))}
        </ul>
      </section>

      {/* Over ons en instructeurs */}
      <section className="mx-auto grid max-w-[1280px] gap-12 px-4 pt-24 sm:px-8 lg:grid-cols-2">
        <div>
          <p className={label} style={{ color: "var(--rs-kleur-tekst)" }}>
            Over ons
          </p>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">Over {r.naam}</h2>
          <p className="mt-5 whitespace-pre-line text-lg leading-relaxed text-schw-night/85">{w.overOns}</p>
          {w.werkgebied.length > 0 && (
            <div className="mt-8">
              <h3 className="font-display text-lg font-bold">Werkgebied</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {w.werkgebied.map((p) => (
                  <li key={p} className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold shadow-sm">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {instructeurs.length > 0 && (
          <div id="instructeurs" className="scroll-mt-24">
            <p className={label} style={{ color: "var(--rs-kleur-tekst)" }}>
              Instructeurs
            </p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">Je instructeurs</h2>
            <ul className="mt-6 space-y-3">
              {instructeurs.map((i) => (
                <li key={i.id} className="flex gap-4 rounded-xl3 bg-white p-5 shadow-[0_20px_50px_-35px_rgba(10,18,14,0.35)]">
                  <span className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-2xl font-display text-xl font-bold" style={{ background: "var(--rs-kleur-knop)", color: "var(--rs-op-kleur)" }} aria-hidden>
                    {i.naam.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <span className="block font-display text-lg font-bold">{i.naam}</span>
                    <span className="block text-xs font-semibold uppercase tracking-wide text-schw-mute">Rijbewijs {i.categorieen.join(", ")}</span>
                    {i.bio && <span className="mt-1.5 block text-sm leading-relaxed text-schw-night/80">{i.bio}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Vragen */}
      {w.faq.length > 0 && (
        <section id="vragen" className="mx-auto grid max-w-[1280px] scroll-mt-24 gap-8 px-4 pt-24 sm:px-8 lg:grid-cols-[1fr_1.6fr] lg:gap-12">
          <div>
            <p className={label} style={{ color: "var(--rs-kleur-tekst)" }}>
              Vragen
            </p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">Veelgestelde vragen</h2>
            <p className="mt-4 leading-relaxed text-schw-mute">
              Staat je vraag er niet bij? {r.telefoon ? `Bel ons op ${telefoonWeergave(r.telefoon)}` : "Neem contact op"}
              {r.email ? ` of mail naar ${r.email}` : ""}.
            </p>
          </div>
          <div className="divide-y divide-schw-night/10 rounded-xl3 bg-white shadow-[0_20px_50px_-35px_rgba(10,18,14,0.35)]">
            {w.faq.map((q) => (
              <details key={q.vraag} className="group p-6">
                <summary className="cursor-pointer list-none font-display text-lg font-bold marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {q.vraag}
                    <span className="text-2xl transition group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 leading-relaxed text-schw-mute">{q.antwoord}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* CTA-band */}
      {r.proeflesOnline && (
        <section className="mx-auto max-w-[1280px] px-4 pt-24 sm:px-8">
          <div className="relative overflow-hidden rounded-xl3 px-8 py-12 sm:px-12" style={knopAccent}>
            <Stuur className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 opacity-15" naaf="transparent" />
            <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Klaar om te beginnen?</h2>
                <p className="mt-2 text-lg">Kies zelf een moment voor je proefles. Binnen een minuut geregeld.</p>
              </div>
              <Link href={sitePad(basis, "/proefles")} className="rounded-full bg-schw-night px-7 py-4 font-bold text-schw-cream transition-transform hover:-translate-y-0.5">
                Plan je proefles
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
