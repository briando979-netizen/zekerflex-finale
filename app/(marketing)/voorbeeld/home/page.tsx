import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { publicOpenShifts } from "@/lib/public-shifts";
import { dedupePlaceParts } from "@/lib/shifts/place-label";
import { Photo } from "@/components/marketing/Photo";
import { SceneMatch, SceneWork } from "@/components/marketing/Scene";
import { Reveal } from "@/components/marketing/Reveal";
import { FaqList } from "@/components/marketing/primitives";

// ---------------------------------------------------------------------------
// PREVIEW of a calmer, shorter, fully honest homepage — admins only, never
// indexed. The live homepage (app/(marketing)/page.tsx) is untouched until the
// owner approves this. Only real data: live open klussen, the real minimum
// rate, the real employer fee. No made-up stats, ratings or testimonials.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Voorbeeld homepage", robots: { index: false, follow: false } };

const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;
const dayFmt = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });
const timeFmt = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

const BRANCHES = ["Logistiek", "Retail", "Horeca", "Evenementen", "Schoonmaak", "Zorg", "Kantoor", "Bouw & techniek"];

export default async function HomePreviewPage() {
  const principal = await getPrincipal();
  // HOME_PREVIEW_PUBLIC=1 only on a local QA copy, for screenshots — never set in production.
  const open4local = process.env.HOME_PREVIEW_PUBLIC === "1" && process.env.VERCEL !== "1";
  if (!open4local && (!principal || !hasRole(principal, "PLATFORM_ADMIN"))) notFound();

  const minRate = env.MIN_SHIFT_RATE_CENTS;
  // never show a klus below the minimum (older ones predate the rule)
  const open = (await publicOpenShifts().catch(() => [])).filter((x) => x.hourlyRateCents >= minRate);
  const latest = open.slice(0, 3);

  return (
    <>
      <div className="bg-warn/15 py-2 text-center text-xs font-semibold text-ink">
        Voorbeeld — alleen zichtbaar voor beheerders. De echte homepage is nog ongewijzigd.
      </div>

      {/* HERO — one message, one choice */}
      <section className="hero-ink relative isolate overflow-hidden text-white">
        <div className="aurora opacity-60" aria-hidden />
        <div className="shell-4k relative grid items-center gap-12 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div>
            <p className="eyebrow text-brand-mint">Freelance · flex · uitzendwerk</p>
            <h1 className="mt-4 text-balance font-display text-[clamp(2.4rem,1.6rem+3.2vw,4.6rem)] font-bold leading-[1.02]">
              Zeker van je werk.
              <br />
              <span className="text-brand-mint">Zeker van je mensen.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/70">
              Klussen door heel Nederland, eerlijk betaald en netjes geregeld — overeenkomst, uren en betaling in één app.
            </p>

            <div className="mt-9 grid max-w-xl gap-3 sm:grid-cols-2">
              <Link href="/register" className="group rounded-2xl bg-brand-mint p-5 text-ink transition hover:-translate-y-0.5">
                <span className="block font-display text-lg font-bold">Ik zoek werk →</span>
                <span className="mt-1 block text-sm text-ink/70">Gratis. Minimaal {euro(minRate)} per uur.</span>
              </Link>
              <Link href="/voor-bedrijven" className="group rounded-2xl border border-white/20 bg-white/[0.04] p-5 transition hover:-translate-y-0.5 hover:bg-white/[0.08]">
                <span className="block font-display text-lg font-bold">Ik zoek mensen →</span>
                <span className="mt-1 block text-sm text-white/60">€ 3,50 per gewerkt uur, geen abonnement.</span>
              </Link>
            </div>

            {open.length > 0 && (
              <p className="mt-6 flex items-center gap-2 text-sm text-white/70">
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-mint" />
                Nu {open.length} open {open.length === 1 ? "klus" : "klussen"} —{" "}
                <Link href="/klussen" className="font-semibold text-white underline">
                  bekijk ze
                </Link>
              </p>
            )}
          </div>
          <div className="relative">
            <Photo name="hero" fallback={<SceneMatch />} priority rounded="rounded-3xl" className="shadow-lift ring-1 ring-white/10" sizes="(max-width:1024px) 100vw, 44vw" />
          </div>
        </div>
      </section>

      {/* REAL KLUSSEN — only when there are any */}
      {latest.length > 0 && (
        <section className="bg-paper">
          <div className="shell-4k py-20 lg:py-24">
            <Reveal className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Nu open</p>
                <h2 className="fluid-h2 mt-3 font-display font-bold">Echte klussen, echte tarieven</h2>
              </div>
              <Link href="/klussen" className="btn-ghost">
                Alle {open.length} klussen →
              </Link>
            </Reveal>
            <ul className="mt-10 grid gap-4 md:grid-cols-3">
              {latest.map((s, i) => (
                <Reveal key={s.id} as="li" delay={i * 90}>
                  <Link href={`/klussen/${s.id}`} className="card block h-full p-5 transition hover:-translate-y-0.5">
                    <p className="text-xs font-semibold text-brand-600">{dedupePlaceParts(s.city)}</p>
                    <p className="mt-1 font-display text-lg font-bold text-ink">{s.title}</p>
                    <p className="mt-1 text-sm text-neutralx-500">
                      {dayFmt.format(s.startsAt)} · {timeFmt.format(s.startsAt)}–{timeFmt.format(s.endsAt)}
                    </p>
                    <p className="mt-4 flex items-baseline justify-between">
                      <span className="num font-display text-xl font-bold text-ink">{euro(s.hourlyRateCents)}<span className="text-sm font-medium text-neutralx-400"> /uur</span></span>
                      <span className="text-xs text-neutralx-400">{s.viaUitzendbureau ? "Uitzenden" : "Freelance"}</span>
                    </p>
                  </Link>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* HOW YOU WORK — the real differentiator */}
      <section className="bg-paper-soft">
        <div className="shell-4k py-20 lg:py-24">
          <Reveal>
            <p className="eyebrow">Jij kiest hoe je werkt</p>
            <h2 className="fluid-h2 mt-3 max-w-3xl text-balance font-display font-bold">Met of zonder KVK — er is altijd een vorm die past</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {[
              { t: "Uitzendkracht", w: "Geen KVK nodig", p: ["ZekerFlex is je werkgever", "Elke week je loon met loonstrook", "Vakantiegeld en pensioen"], href: "/uitzendbureau", hi: true },
              { t: "Flexwerker", w: "Af en toe zelfstandig", p: ["Je eigen tarief en ritme", "Btw optioneel of KOR", "Facturen worden voor je gemaakt"], href: "/voor-freelancers", hi: false },
              { t: "Zzp'er", w: "Eigen bedrijf met KVK", p: ["Modelovereenkomst per opdracht", "Geen facturen sturen", "Wet DBA bewaakt"], href: "/voor-freelancers", hi: false },
            ].map((w, i) => (
              <Reveal key={w.t} delay={i * 90}>
                <Link
                  href={w.href}
                  className={`flex h-full flex-col rounded-2xl p-6 transition hover:-translate-y-0.5 ${w.hi ? "bg-brand-500 text-white shadow-lift" : "card"}`}
                >
                  <span className="font-display text-xl font-bold">{w.t}</span>
                  <span className={`mt-1 text-sm ${w.hi ? "text-white/75" : "text-neutralx-500"}`}>{w.w}</span>
                  <ul className={`mt-4 space-y-1.5 text-sm ${w.hi ? "text-white/90" : "text-neutralx-600"}`}>
                    {w.p.map((x) => (
                      <li key={x}>✓ {x}</li>
                    ))}
                  </ul>
                  <span className={`mt-5 text-sm font-semibold ${w.hi ? "text-white" : "text-brand-600"}`}>Meer weten →</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS + PHOTO */}
      <section className="bg-paper">
        <div className="shell-4k grid items-center gap-12 py-20 lg:grid-cols-2 lg:py-24">
          <Reveal>
            <p className="eyebrow">Zo werkt het</p>
            <h2 className="fluid-h2 mt-3 font-display font-bold">In drie stappen aan het werk</h2>
            <ol className="mt-8 space-y-6">
              {[
                ["Account maken", "In een paar minuten, met je ID en bankrekening. Bedrijven registreren met hun KVK."],
                ["Klus kiezen", "Je ziet tarief, tijden en reistijd vooraf. Reageren is één tik."],
                ["Werken en betaald worden", "Inchecken op locatie, uren goedkeuren — de betaling regelt ZekerFlex."],
              ].map(([t, b], i) => (
                <li key={t} className="flex gap-4">
                  <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-brand-500 font-display font-bold text-white">{i + 1}</span>
                  <span>
                    <span className="block font-display text-lg font-semibold">{t}</span>
                    <span className="mt-0.5 block text-neutralx-600">{b}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal delay={120}>
            <Photo name="freelancer" fallback={<SceneWork />} rounded="rounded-3xl" className="shadow-lift" sizes="(max-width:1024px) 100vw, 50vw" />
          </Reveal>
        </div>
      </section>

      {/* BRANCHES — compact */}
      <section className="bg-paper-soft">
        <div className="shell-4k py-16">
          <Reveal>
            <p className="eyebrow">Branches</p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {BRANCHES.map((b) => (
                <Link key={b} href="/klussen" className="rounded-full border border-hairstrong bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-brand-500 hover:text-brand-600">
                  {b}
                </Link>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* WHY — only verifiable facts */}
      <section className="hero-ink relative isolate overflow-hidden text-white">
        <div className="shell-4k relative grid gap-8 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [euro(minRate), "minimum uurtarief per klus"],
            ["€ 3,50", "per gewerkt uur voor bedrijven — geen abonnement"],
            ["1", "modelovereenkomst per opdracht, Wet DBA-proof"],
            ["100%", "gehost in Nederland"],
          ].map(([v, l]) => (
            <div key={l}>
              <div className="font-display text-4xl font-bold text-brand-mint">{v}</div>
              <div className="mt-2 text-sm text-white/60">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-paper">
        <div className="shell-4k grid gap-10 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
          <Reveal>
            <p className="eyebrow">Veelgestelde vragen</p>
            <h2 className="fluid-h2 mt-3 font-display font-bold">Goed om te weten</h2>
          </Reveal>
          <Reveal delay={100}>
            <FaqList
              items={[
                { q: "Kan ik werken zonder KVK?", a: "Ja. Als uitzendkracht is ZekerFlex je werkgever: je krijgt elke week je loon met een echte loonstrook, inclusief vakantiegeld en pensioen." },
                { q: "Wat kost ZekerFlex?", a: "Voor freelancers en uitzendkrachten is het gratis. Bedrijven betalen € 3,50 per gewerkt uur, alleen als er echt iemand werkt." },
                { q: "Hoeveel verdien ik minimaal?", a: `Opdrachtgevers kunnen geen klus plaatsen onder ${euro(minRate)} per uur.` },
                { q: "Moet ik zelf facturen sturen?", a: "Nee. ZekerFlex maakt de facturen automatisch aan, met de juiste btw." },
              ]}
            />
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="hero-ink relative isolate overflow-hidden text-white">
        <div className="shell-4k flex flex-col items-start justify-between gap-6 py-16 lg:flex-row lg:items-center">
          <h2 className="fluid-h2 font-display font-bold">Klaar om te beginnen?</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/register" className="btn-mint text-base">
              Gratis account maken
            </Link>
            <Link href="/voor-bedrijven" className="btn-ghost-invert text-base">
              Personeel inhuren
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
