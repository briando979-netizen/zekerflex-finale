import type { ReactNode } from "react";
import type { Metadata } from "next";
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
import { HeroMap } from "@/components/marketing/HeroMap";
import { HomeTabs } from "@/components/marketing/HomeTabs";
import { publicOpenShifts } from "@/lib/public-shifts";
import { canonical, faqJsonLd, serviceJsonLd, SITE } from "@/lib/seo";

export const revalidate = 600;

const TITLE = "ZekerFlex — freelance werk & klussen in heel Nederland | flexwerk, zzp en uitzendwerk";
const DESCRIPTION =
  "Hét Nederlandse platform voor freelance werk, flexwerk en uitzendwerk in heel Nederland. Freelancers en flexkrachten vinden klussen dat past bij hun vak en reistijd en kiezen zelf hoe snel ze worden uitbetaald. Bedrijven huren betrouwbaar personeel in voor € 3,50 per gewerkt uur — Wet DBA-proof, geen abonnement.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [...SITE.keywords],
  ...canonical("/", { title: TITLE, description: DESCRIPTION }),
};

export default async function HomePage() {
  const openCount = (await publicOpenShifts().catch(() => [])).length;
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([faqJsonLd(), serviceJsonLd()]),
        }}
      />
      {/* ───────────────────────────────────────────────────────────── HERO */}
      <HeroStage
        map={<HeroMap className="h-full w-full" />}
        openCount={openCount}
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
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/60">Gebouwd op</span>
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

      {/* ──────────────────────────────────────────────── KIES JE PAD (tabs) */}
      <section id="hoe-het-werkt" className="relative scroll-mt-24 bg-paper">
        <div className="shell-4k py-24 lg:py-32">
          <Reveal>
            <p className="eyebrow">Hoe het werkt</p>
            <h2 className="fluid-h2 mt-4 max-w-3xl text-balance font-display font-bold">Kies hoe jij ZekerFlex gebruikt</h2>
            <p className="fluid-lead mt-5 max-w-2xl text-neutralx-600">Drie stappen, geen mailwisselingen, geen losse facturen.</p>
          </Reveal>
          <div className="mt-10">
            <HomeTabs
              tabs={PATHS.map((path) => ({ id: path.id, label: path.label, content: <PathPanel path={path} /> }))}
            />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────── BRANCHES */}
      <BranchShowcase />

      {/* ────────────────────────────────────────────── SHIFT SHOWCASE */}
      <ShiftShowcase />

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

      {/* ──────────────────────────────────────────────────── TESTIMONIAL */}
      <section className="relative isolate overflow-hidden bg-[#0C0E12] text-white">
        <div className="aurora opacity-60" aria-hidden />
        <div className="shell-4k relative py-24 lg:py-32">
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

      {/* ───────────────────────────────────────────── MEER WETEN (tabs) */}
      <section className="relative bg-paper-soft">
        <div className="shell-4k py-24 lg:py-32">
          <Reveal>
            <p className="eyebrow">Meer weten</p>
            <h2 className="fluid-h2 mt-4 max-w-3xl text-balance font-display font-bold">Alles wat flexwerk betrouwbaar maakt</h2>
          </Reveal>
          <div className="mt-10">
            <HomeTabs
              tabs={[
                {
                  id: "platform",
                  label: "Het platform",
                  content: (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {FEATURES.map((f) => (
                        <div key={f.title} className="glass-light h-full rounded-2xl p-7">
                          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-500">{f.icon}</div>
                          <h3 className="mt-5 font-display text-lg font-semibold">{f.title}</h3>
                          <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{f.body}</p>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  id: "zekerheid",
                  label: "Zekerheid & regels",
                  content: (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {COMPLIANCE.map((c) => (
                        <div key={c.title} className="card h-full p-6">
                          <h3 className="font-display text-base font-semibold">{c.title}</h3>
                          <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">{c.body}</p>
                        </div>
                      ))}
                    </div>
                  ),
                },
                { id: "faq", label: "Veelgestelde vragen", content: <div className="max-w-3xl"><FaqList items={FAQ} /></div> },
              ]}
            />
          </div>
        </div>
      </section>

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

/* ─────────────────────────────────────────────────────────── path panel */

interface Path {
  id: string;
  label: string;
  title: string;
  body: string;
  steps: [string, string][];
  points: string[];
  href: string;
  cta: string;
  more: { href: string; label: string };
  photo: ReactNode;
}

function PathPanel({ path }: { path: Path }) {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
      <div>
        <h3 className="font-display text-[clamp(1.6rem,1.2rem+1.2vw,2.3rem)] font-bold leading-tight">{path.title}</h3>
        <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-neutralx-600">{path.body}</p>
        <ol className="mt-8 space-y-4">
          {path.steps.map(([t, b], i) => (
            <li key={t} className="flex gap-4">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 font-display text-sm font-bold text-white shadow-glow">
                {i + 1}
              </span>
              <span>
                <span className="block font-semibold text-ink">{t}</span>
                <span className="block text-sm leading-relaxed text-neutralx-600">{b}</span>
              </span>
            </li>
          ))}
        </ol>
        <ul className="mt-7 flex flex-wrap gap-2">
          {path.points.map((pt) => (
            <li key={pt} className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700">
              ✓ {pt}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={path.href} className="btn-primary text-base">
            {path.cta}
          </Link>
          <Link href={path.more.href} className="btn-ghost text-base">
            {path.more.label}
          </Link>
        </div>
      </div>
      <div className="overflow-hidden rounded-3xl shadow-lift">{path.photo}</div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── content */

const PATHS: Path[] = [
  {
    id: "werk",
    label: "Ik zoek werk",
    title: "Werk dat bij je past. Geld dat op tijd komt.",
    body: "Als zzp'er of flexwerker kies je zelf je klussen en je tarief. Jij levert vakmanschap; wij regelen de match, de overeenkomst, de factuur en de uitbetaling.",
    steps: [
      ["Meld je aan en verifieer", "KVK- of EU-btw-nummer koppelen en een korte ID-check — meestal binnen een paar minuten klaar."],
      ["Reageer op klussen in de buurt", "Aanbod afgestemd op je reistijd, vak en beschikbaarheid."],
      ["Werk en kies je uitbetaling", "Na goedkeuring van je uren: direct, binnen 3 dagen of gratis binnen 30 dagen."],
    ],
    points: ["Geen facturen sturen", "Modelovereenkomst, Wet DBA-proof", "Badges van Brons tot Platina"],
    href: "/register?type=freelancer",
    cta: "Gratis account maken",
    more: { href: "/klussen", label: "Bekijk open klussen" },
    photo: <Photo name="freelancer" fallback={<SceneWork />} rounded="rounded-3xl" sizes="(max-width:1024px) 100vw, 46vw" />,
  },
  {
    id: "uitzend",
    label: "Zonder KVK",
    title: "Geen eigen bedrijf? Werk via ons uitzendbureau.",
    body: "ZekerFlex is dan je werkgever. Je kiest zelf je uren en krijgt elke week loon met een echte loonstrook.",
    steps: [
      ["Maak een account als uitzendkracht", "Geen KVK nodig — alleen je ID en rekeningnummer."],
      ["Kies je klussen", "Zelfde app, zelfde klussen in de buurt."],
      ["Elke week loon", "Met vakantiegeld (8,33%), pensioen via StiPP en het ABU-fasensysteem."],
    ],
    points: ["Wekelijkse loonstrook", "Pensioen vanaf week 9", "Papierwerk geregeld"],
    href: "/register?type=uitzendkracht",
    cta: "Werken als uitzendkracht",
    more: { href: "/uitzendbureau", label: "Meer over het uitzendbureau" },
    photo: <Photo name="hero" fallback={<SceneMatch />} rounded="rounded-3xl" sizes="(max-width:1024px) 100vw, 46vw" />,
  },
  {
    id: "mensen",
    label: "Ik zoek mensen",
    title: "Betrouwbare mensen, precies wanneer je ze nodig hebt.",
    body: "Zet een klus uit en ZekerFlex regelt de rest: match, overeenkomst, check-in, facturatie en compliance.",
    steps: [
      ["Registreer je bedrijf", "We controleren je KVK; ondertussen kun je al een testklus plaatsen."],
      ["Plaats een klus", "Geverifieerde krachten in de buurt krijgen hem direct — gematcht op reistijd en betrouwbaarheid."],
      ["Keur uren goed", "GPS check-in, uren goedkeuren met één tik, de factuur volgt vanzelf."],
    ],
    points: ["€ 3,50 per gewerkt uur", "Geen abonnement", "Wet DBA-risico's zichtbaar"],
    href: "/register?type=bedrijf",
    cta: "Gratis klus plaatsen",
    more: { href: "/voor-bedrijven", label: "Alles voor bedrijven" },
    photo: <Photo name="employer" fallback={<SceneApprove />} rounded="rounded-3xl" sizes="(max-width:1024px) 100vw, 46vw" />,
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
