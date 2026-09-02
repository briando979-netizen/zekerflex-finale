import type { ReactNode } from "react";
import Link from "next/link";
import { Photo } from "@/components/marketing/Photo";
import { SceneMatch, SceneWork, SceneApprove } from "@/components/marketing/Scene";
import { HeroStage } from "@/components/marketing/HeroStage";
import { Reveal } from "@/components/marketing/Reveal";
import { CountUp } from "@/components/marketing/CountUp";
import { FaqList } from "@/components/marketing/primitives";
import { Marquee } from "@/components/marketing/Marquee";
import { ShiftShowcase } from "@/components/marketing/ShiftShowcase";
import { BranchShowcase } from "@/components/marketing/BranchShowcase";
import { AppDownload } from "@/components/marketing/AppDownload";
import { faqJsonLd } from "@/lib/seo";

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }}
      />
      {/* ───────────────────────────────────────────────────────────── HERO */}
      <HeroStage
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

      {/* ──────────────────────────────────────────────────────── TRUST BAND */}
      <section className="relative border-y border-white/10 bg-[#0C0E12] text-white">
        <div className="shell-4k flex flex-wrap items-center justify-between gap-x-12 gap-y-4 py-9">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/35">Gebouwd op</span>
          {["KVK Handelsregister", "Geverifieerde identiteit (KYC)", "SEPA-uitbetaling", "Wet DBA-monitor"].map(
            (t, i) => (
              <Reveal key={t} as="span" delay={i * 80} className="flex items-center gap-2.5 text-sm font-medium text-white/75">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-mint" />
                {t}
              </Reveal>
            ),
          )}
        </div>
        <div className="border-t border-white/5 bg-[#0A0C10]">
          <Marquee
            items={[
              "Sneller uitbetalen als optie",
              "Geen abonnement",
              "100% in Nederland gehost",
              "Modelovereenkomst inbegrepen",
              "Wet DBA-proof",
              "Reverse billing",
              "Geen tussenpartijen",
              "Wekelijkse verloning",
            ]}
          />
        </div>
      </section>

      {/* ──────────────────────────────────────────────────── BRANCHES */}
      <BranchShowcase />

      {/* ─────────────────────────────────────────────────── HOE HET WERKT */}
      <section id="hoe-het-werkt" className="relative scroll-mt-24 bg-paper">
        <div className="shell-4k py-28 lg:py-36">
          <Reveal>
            <p className="eyebrow">Hoe het werkt</p>
            <h2 className="fluid-h2 mt-4 max-w-3xl text-balance font-display font-bold">
              Van aanmelding tot uitbetaling in drie stappen
            </h2>
            <p className="fluid-lead mt-5 max-w-2xl text-neutralx-600">
              Geen mailwisselingen, geen losse facturen, geen wachten op je geld.
            </p>
          </Reveal>

          <ol className="mt-16 grid gap-6 md:grid-cols-3 lg:gap-8">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} as="li" delay={i * 120} className="relative">
                <div className="glass-light group h-full rounded-3xl p-8 transition-transform duration-500 hover:-translate-y-1.5">
                  <div className="flex items-center gap-4">
                    <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 font-display text-lg font-bold text-white shadow-glow">
                      {i + 1}
                    </span>
                    {i < STEPS.length - 1 && (
                      <span className="hidden h-px flex-1 bg-gradient-to-r from-brand-300/70 to-transparent md:block" />
                    )}
                  </div>
                  <h3 className="mt-6 font-display text-2xl font-semibold">{s.title}</h3>
                  <p className="mt-3 text-[1.02rem] leading-relaxed text-neutralx-600">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ────────────────────────────────────────────── SHIFT SHOWCASE */}
      <ShiftShowcase />

      {/* ───────────────────────────────────────────── SPLIT · FREELANCERS */}
      <ShowcaseSplit
        eyebrow="Voor freelancers"
        title="Werk dat bij je past. Geld dat op tijd komt."
        body="Jij levert vakmanschap. Wij regelen de match, de overeenkomst, de factuur en de uitbetaling."
        points={[
          "Aanbod afgestemd op je reistijd, skills en beschikbaarheid",
          "Zelf kiezen hoe snel je uitbetaald wordt — geen facturen sturen",
          "Één modelovereenkomst, altijd Wet DBA-proof",
          "Bouw badges op van Brons tot Platina",
        ]}
        href="/voor-freelancers"
        cta="Voor freelancers"
        photo={<Photo name="freelancer" fallback={<SceneWork />} rounded="rounded-3xl" sizes="(max-width:1024px) 100vw, 52vw" />}
      />

      {/* ───────────────────────────────────────────────── SPLIT · BEDRIJVEN */}
      <ShowcaseSplit
        reverse
        tone="ink"
        eyebrow="Voor bedrijven"
        title="Betrouwbare mensen, precies wanneer je ze nodig hebt."
        body="Zet een dienst uit en ZekerFlex regelt de rest: match, overeenkomst, check-in, facturatie en compliance."
        points={[
          "Automatische matching en toewijzing per vestiging",
          "Uren goedkeuren met GPS check-in — facturen volgen vanzelf",
          "Wet DBA-risico's zichtbaar vóór ze een probleem worden",
          "Alleen betalen bij gebruik: € 3,50 platformkosten per gewerkt uur",
        ]}
        href="/voor-bedrijven"
        cta="Voor bedrijven"
        photo={<Photo name="employer" fallback={<SceneApprove />} rounded="rounded-3xl" sizes="(max-width:1024px) 100vw, 52vw" />}
      />

      {/* ──────────────────────────────────────────── DRIE WERKVORMEN */}
      <section className="relative bg-paper-soft">
        <div className="shell-4k py-28 lg:py-36">
          <Reveal>
            <p className="eyebrow">Drie manieren om te werken</p>
            <h2 className="fluid-h2 mt-4 max-w-3xl text-balance font-display font-bold">
              Zzp&apos;er, flexwerker — of via ons uitzendbureau
            </h2>
            <p className="fluid-lead mt-5 max-w-2xl text-neutralx-600">
              Geen eigen bedrijf? Werk als uitzendkracht via ZekerFlex. Wij zijn dan je
              werkgever, verlonen je <strong>elke week</strong> met een echte loonstrook, en
              regelen vakantiegeld, pensioen en het ABU-fasensysteem.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {WORKFORMS.map((w, i) => (
              <Reveal key={w.kind} delay={i * 110}>
                <div
                  className={`flex h-full flex-col rounded-2xl p-7 ${
                    w.highlight ? "bg-brand-500 text-white shadow-lift" : "glass-light"
                  }`}
                >
                  <h3 className="font-display text-xl font-bold">{w.kind}</h3>
                  <p className={`mt-2 text-sm ${w.highlight ? "text-white/75" : "text-neutralx-500"}`}>
                    {w.who}
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {w.points.map((p) => (
                      <li
                        key={p}
                        className={`flex gap-2.5 text-sm ${w.highlight ? "text-white/90" : "text-neutralx-600"}`}
                      >
                        <span className="mt-1 flex-shrink-0">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path
                              d="M5 13l4 4L19 7"
                              stroke={w.highlight ? "#FFFFFF" : "#0E5C4A"}
                              strokeWidth="2.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={w.href}
                    className={`mt-7 self-start text-sm font-semibold ${
                      w.highlight ? "text-white underline" : "text-brand-600 hover:underline"
                    }`}
                  >
                    {w.cta} →
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────── STATS BAND */}
      <section className="relative isolate overflow-hidden bg-[#0C0E12] text-white">
        <div className="aurora opacity-70" aria-hidden />
        <div className="shell-4k relative py-24 lg:py-32">
          <div className="grid gap-14 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { v: <>&lt; <CountUp value={4} /> uur</>, l: "gemiddeld tot uitbetaling" },
              { v: <CountUp value={98.6} decimals={1} suffix="%" />, l: "diensten volledig ingevuld" },
              { v: <CountUp value={0} />, l: "externe tussenpartijen" },
              { v: "24/7", l: "platform & assistent bereikbaar" },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 100}>
                <div className="fluid-stat font-display font-bold text-brand-mint">{s.v}</div>
                <div className="mt-3 text-sm text-white/55">{s.l}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────── FEATURES */}
      <section className="relative bg-paper-soft">
        <div className="shell-4k py-28 lg:py-36">
          <Reveal>
            <p className="eyebrow">Het platform</p>
            <h2 className="fluid-h2 mt-4 max-w-3xl text-balance font-display font-bold">
              Alles wat flexibel werk betrouwbaar maakt, in één systeem
            </h2>
          </Reveal>
          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 90}>
                <div className="glass-light h-full rounded-2xl p-7">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-500">{f.icon}</div>
                  <h3 className="mt-5 font-display text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────── COMPLIANCE */}
      <section className="relative bg-paper">
        <div className="shell-4k grid gap-16 py-28 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:py-36">
          <Reveal>
            <p className="eyebrow">Zeker zit het goed</p>
            <h2 className="fluid-h2 mt-4 text-balance font-display font-bold">
              Compliance is geen bijzaak — het zit in de kern
            </h2>
            <p className="fluid-lead mt-5 text-neutralx-600">
              ZekerFlex controleert doorlopend of een samenwerking binnen de regels blijft, en
              grijpt in vóór het misgaat.
            </p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {COMPLIANCE.map((c, i) => (
              <Reveal key={c.title} delay={i * 90}>
                <div className="card h-full p-6">
                  <h3 className="font-display text-base font-semibold">{c.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">{c.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────── TESTIMONIAL */}
      <section className="relative isolate overflow-hidden bg-[#0C0E12] text-white">
        <div className="aurora opacity-60" aria-hidden />
        <div className="shell-4k relative py-28 lg:py-36">
          <Reveal className="mx-auto max-w-4xl text-center">
            <figure>
              <blockquote className="text-balance font-display text-[clamp(1.5rem,1.1rem+1.6vw,2.6rem)] font-semibold leading-snug">
                &ldquo;Ik plaats &apos;s ochtends een dienst en heb binnen tien minuten een bekende
                kracht die komt. De uren keur ik &apos;s avonds goed, de factuur staat er
                automatisch. Zo hoort het.&rdquo;
              </blockquote>
              <figcaption className="mt-8 text-sm text-white/50">
                Merel — vestigingsmanager, supermarktketen Amsterdam
              </figcaption>
            </figure>
          </Reveal>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────── FAQ */}
      <section className="relative bg-paper-soft">
        <div className="shell-4k grid gap-14 py-28 lg:grid-cols-[0.8fr_1.2fr] lg:py-36">
          <Reveal>
            <p className="eyebrow">Veelgestelde vragen</p>
            <h2 className="fluid-h2 mt-4 font-display font-bold">Goed om te weten</h2>
          </Reveal>
          <Reveal delay={120}>
            <FaqList items={FAQ} />
          </Reveal>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────── APP */}
      <AppDownload />

      {/* ────────────────────────────────────────────────────────── CTA */}
      <section className="relative isolate overflow-hidden hero-ink text-white">
        <div className="aurora" aria-hidden />
        <div className="shell-4k relative py-28 lg:py-36">
          <Reveal className="flex flex-col items-start justify-between gap-10 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <h2 className="fluid-h2 text-balance font-display font-bold">Klaar om zeker te werken?</h2>
              <p className="fluid-lead mt-4 text-white/65">
                Maak in een paar minuten een account aan. Gratis voor freelancers, geen
                opstartkosten voor bedrijven.
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap gap-3">
              <Link href="/register" className="btn-mint text-base">
                Account aanmaken
              </Link>
              <Link href="/prijzen" className="btn-ghost-invert text-base">
                Bekijk de prijzen
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
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
}) {
  const dark = tone === "ink";
  return (
    <section className={`relative isolate overflow-hidden ${dark ? "hero-ink text-white" : "bg-paper"}`}>
      {dark && <div className="aurora opacity-50" aria-hidden />}
      <div
        className={`shell-4k relative grid items-center gap-14 py-28 lg:py-36 lg:gap-24 ${
          reverse ? "lg:grid-cols-[0.95fr_1.05fr]" : "lg:grid-cols-[1.05fr_0.95fr]"
        }`}
      >
        <Reveal className={reverse ? "lg:order-2" : ""}>
          <p className={`eyebrow ${dark ? "text-brand-mint" : ""}`}>{eyebrow}</p>
          <h2 className="fluid-h2 mt-4 text-balance font-display font-bold">{title}</h2>
          <p className={`fluid-lead mt-5 max-w-xl ${dark ? "text-white/65" : "text-neutralx-600"}`}>{body}</p>
          <ul className="mt-8 space-y-3.5">
            {points.map((p) => (
              <li key={p} className={`flex gap-3 text-[1.02rem] ${dark ? "text-white/75" : "text-neutralx-600"}`}>
                <span className="mt-1 flex-shrink-0">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 13l4 4L19 7" stroke={dark ? "#4FE0A0" : "#0E5C4A"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {p}
              </li>
            ))}
          </ul>
          <Link href={href} className={`${dark ? "btn-ghost-invert" : "btn-ghost"} mt-9 self-start text-base`}>
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

const STEPS = [
  {
    title: "Meld je aan en verifieer",
    body: "Werknemers koppelen hun KVK en doorlopen een korte identiteitscheck. Bedrijven registreren hun organisatie en vestigingen.",
  },
  {
    title: "Word slim gematcht",
    body: "Bij een nieuwe dienst rangschikt ZekerFlex kandidaten op reistijd, betrouwbaarheid en vakmatch. De beste match wordt direct toegewezen.",
  },
  {
    title: "Werk en word betaald",
    body: "Check in op locatie en werk je dienst. Zodra de uren zijn goedgekeurd kies je zelf hoe snel je uitbetaald wilt worden — gratis wachten of sneller tegen een fee.",
  },
];

const WORKFORMS = [
  {
    kind: "Via ons uitzendbureau",
    who: "Geen KVK nodig. ZekerFlex is je werkgever.",
    points: [
      "Wekelijkse verloning met loonstrook",
      "Vakantiegeld (8,33%) en vakantie-uren",
      "Pensioen via StiPP vanaf week 9",
      "ABU-fasensysteem: zekerheid die meegroeit",
    ],
    href: "/uitzendbureau",
    cta: "Werken via het uitzendbureau",
    highlight: true,
  },
  {
    kind: "Als flexwerker",
    who: "Af en toe zelfstandig, soms met de KOR.",
    points: [
      "Btw optioneel of kleineondernemersregeling",
      "Self-invoice of reverse billing",
      "Je eigen tarief en ritme",
      "Lichte fiscale administratie",
    ],
    href: "/voor-freelancers",
    cta: "Meer over flexwerk",
    highlight: false,
  },
  {
    kind: "Als zzp'er",
    who: "Eigen bedrijf met KVK en btw-nummer.",
    points: [
      "Reverse billing — geen facturen sturen",
      "Zelf je uitbetaalsnelheid kiezen",
      "Modelovereenkomst per opdrachtgever",
      "Wet DBA-monitor bewaakt je risico",
    ],
    href: "/voor-freelancers",
    cta: "Meer voor zzp'ers",
    highlight: false,
  },
];

const FEATURES = [
  { title: "Slimme matching", body: "Gewogen score op reistijd, reviews, vakmatch en badge-niveau — niet wie het eerst klikt.", icon: <IconTarget /> },
  { title: "Uitbetaling naar keuze", body: "Gratis wachten op de reguliere termijn, of sneller uitbetaald worden tegen een fee — jij kiest per dienst.", icon: <IconBolt /> },
  { title: "Wet DBA-monitor", body: "Urenconcentratie, opeenvolgende weken en omzetafhankelijkheid worden live bewaakt.", icon: <IconShield /> },
  { title: "Automatische facturatie", body: "Reverse billing: de dienst- en platformfactuur worden voor je aangemaakt, btw-correct.", icon: <IconDoc /> },
  { title: "GPS check-in", body: "Check-ins worden gegeofenced tegen de vestiging. Afwijkingen openen automatisch een dispuut.", icon: <IconPin /> },
  { title: "Meldingen die kloppen", body: "Je krijgt alleen een push als het relevant is — en nooit tijdens je rust-uren.", icon: <IconBell /> },
];

const COMPLIANCE = [
  { title: "Modelovereenkomst", body: "Elke opdracht loopt onder een goedgekeurde modelovereenkomst die per relatie klaarstaat." },
  { title: "KVK-validatie", body: "Inschrijving en btw-nummer worden bij aanmelding gecontroleerd tegen het Handelsregister." },
  { title: "Identiteitsverificatie", body: "Een geverifieerde identiteit (KYC) is verplicht voordat je een dienst kunt aannemen." },
  { title: "Auditspoor", body: "Elke gevoelige handeling wordt onwisbaar vastgelegd en is terug te zien voor beheerders." },
];

const FAQ = [
  { q: "Kan ik werken zonder KVK?", a: "Ja. Via ons uitzendbureau werk je als uitzendkracht: ZekerFlex is dan je werkgever en verloont je elke week met een echte loonstrook, inclusief vakantiegeld, pensioen (StiPP) en het ABU-fasensysteem. Alles is terug te lezen in je dashboard onder ‘Verloning’." },
  { q: "Wat kost ZekerFlex?", a: "Meedoen als freelancer is gratis. Bedrijven betalen € 3,50 platformkosten per gewerkt uur, en alleen wanneer er daadwerkelijk iemand werkt. Geen abonnement, geen opstartkosten." },
  { q: "Hoe snel word ik als zzp'er betaald?", a: "Dat kies je zelf. Standaard wacht je gratis tot de opdrachtgever binnen 30 dagen afrekent. Wil je eerder, dan kies je een snellere uitbetaling tegen een fee: bij urengoedkeuring (4% van de factuur), binnen 3 dagen (2%) of direct. Een voorschot van maximaal 80% op openstaande diensten kost 3%." },
  { q: "Moet ik zelf facturen sturen?", a: "Nee. ZekerFlex werkt met reverse billing en maakt de facturen automatisch aan: één voor jouw dienst, één voor de platformfee, met de juiste btw-behandeling." },
  { q: "Hoe blijft dit binnen de Wet DBA?", a: "Elke samenwerking loopt onder een modelovereenkomst. Daarnaast bewaakt het platform doorlopend risicosignalen zoals urenconcentratie bij één opdrachtgever en te veel opeenvolgende weken, en beperkt het de matching als het spannend wordt." },
  { q: "Is mijn data veilig?", a: "Het platform draait volledig in Nederland zonder externe tussenpartijen. Gevoelige gegevens worden versleuteld opgeslagen en elke handeling wordt vastgelegd in een auditspoor." },
];

/* icons */
function IconTarget() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>); }
function IconBolt() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill="currentColor" /></svg>); }
function IconShield() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>); }
function IconDoc() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 3h8l4 4v14H6V3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 12h6M9 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>); }
function IconPin() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="12" cy="10" r="2.5" fill="currentColor" /></svg>); }
function IconBell() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 16V10a6 6 0 1 1 12 0v6l2 2H4l2-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>); }
