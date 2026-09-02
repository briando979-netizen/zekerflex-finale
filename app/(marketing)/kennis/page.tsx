import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand } from "@/components/marketing/primitives";
import { GUIDES, POSTS, nlDate } from "@/lib/kennis/content";
import { WHITEPAPERS } from "@/lib/kennis/whitepapers";

export const metadata: Metadata = {
  title: "Kennis",
  description:
    "Informatie, kennisbank, blogs en veelgestelde vragen over flexibel werken via ZekerFlex — Wet DBA, StiPP, uitbetaling en meer.",
};

const INFO = [
  { t: "Wat is ZekerFlex?", b: "Eén platform waar werknemers en werkgevers elkaar vinden: slim gematcht op reistijd en vak, met flexibele uitbetaling en compliance ingebouwd." },
  { t: "Voor wie?", b: "Freelancers (zzp of flexwerker), uitzendkrachten via ons uitzendbureau, en bedrijven die flexibele bezetting nodig hebben." },
  { t: "Wat kost het?", b: "Gratis voor freelancers. Bedrijven betalen € 3,50 platformkosten per gewerkt uur — alleen bij gebruik." },
  { t: "Hoe zit het met de Wet DBA?", b: "Elke opdracht loopt onder een goedgekeurde modelovereenkomst; het platform bewaakt doorlopend de risicosignalen." },
  { t: "Waar draait het?", b: "Volledig op eigen Nederlandse infrastructuur. Geen data die ongevraagd de grens over gaat." },
  { t: "En mijn geld?", b: "Je kiest zelf: gratis wachten tot de opdrachtgever binnen 30 dagen afrekent, of sneller uitbetaald worden tegen een fee (4% bij urengoedkeuring, 2% binnen 3 dagen, of direct)." },
];

export default function KennisPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">Kennis</p>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
            Alles wat je wilt weten over flexibel werken via ZekerFlex
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Van de Wet DBA tot StiPP-pensioen en hoe je sneller uitbetaald krijgt. Kort, concreet en actueel.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/kennis#kennisbank" className="btn-mint">
              Naar de kennisbank
            </Link>
            <Link href="/kennis/faq" className="btn-ghost-invert">
              Veelgestelde vragen
            </Link>
          </div>
        </div>
      </div>

      {/* Informatie */}
      <Section tone="paper">
        <div id="informatie" className="scroll-mt-24" />
        <SectionHead
          eyebrow="Informatie"
          title="De basis in één oogopslag"
          intro="De belangrijkste vragen kort beantwoord. Wil je meer diepgang? Kijk in de kennisbank hieronder."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {INFO.map((i) => (
            <div key={i.t} className="card p-6">
              <h3 className="font-display text-lg font-semibold">{i.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{i.b}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Kennisbank */}
      <Section tone="soft">
        <div id="kennisbank" className="scroll-mt-24" />
        <SectionHead
          eyebrow="Kennisbank"
          title="Uitgelegde onderwerpen"
          intro="Diepere artikelen over de dingen die er echt toe doen als je flexibel werkt."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {GUIDES.map((g) => (
            <Link
              key={g.slug}
              href={`/kennis/${g.slug}`}
              className="group flex flex-col rounded-2xl border border-hair bg-paper p-6 shadow-e1 transition-all hover:-translate-y-1 hover:shadow-e3"
            >
              <span className="pill w-fit bg-mintwash text-brand-600">{g.category}</span>
              <h3 className="mt-3 font-display text-lg font-semibold text-ink">{g.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-neutralx-600">{g.excerpt}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                Lezen · {g.readMinutes} min
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {/* Wet DBA callout */}
      <Section tone="paper">
        <div className="rounded-3xl border border-hair bg-mintwash/60 p-8 md:p-10">
          <p className="eyebrow text-brand-600">Voor opdrachtgevers</p>
          <h2 className="mt-3 max-w-2xl text-balance font-display text-2xl font-bold text-ink md:text-3xl">
            Mag ik morgen nog gewoon een freelancer inhuren?
          </h2>
          <p className="mt-3 max-w-xl text-neutralx-600">
            Schijnzelfstandigheid en handhaving, plus praktische hulp bij je account, facturatie, diensten
            plaatsen en uren goedkeuren.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/kennis/wet-dba" className="btn-primary">
              Wet DBA-kenniscentrum
            </Link>
            <Link href="/kennis/werkgevers" className="btn-ghost">
              Helpcentrum voor opdrachtgevers
            </Link>
          </div>
        </div>
      </Section>

      {/* Whitepapers */}
      <section className="hero-ink text-white">
        <div id="whitepapers" className="scroll-mt-24" />
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">Whitepapers</p>
          <h2 className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight md:text-4xl">
            Klik en download de whitepapers
          </h2>
          <p className="mt-4 max-w-xl text-white/65">
            De onderwerpen die er echt toe doen — als pdf in ZekerFlex-stijl om te bewaren.
          </p>
          <ul className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            {WHITEPAPERS.map((w, i) => (
              <li
                key={w.slug}
                className={`flex items-center gap-4 px-5 py-4 ${i > 0 ? "border-t border-white/10" : ""}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="flex-shrink-0 text-brand-mint">
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M14 3v5h5M8.5 13h7M8.5 16.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <Link href={`/kennis/whitepapers/${w.slug}`} className="min-w-0 flex-1 hover:text-white">
                  <span className="block text-sm font-semibold text-white">{w.title}</span>
                  <span className="block truncate text-xs text-white/50">{w.subtitle}</span>
                </Link>
                <a
                  href={`/api/kennis/whitepaper/${w.slug}`}
                  className="flex-shrink-0 rounded-full bg-brand-mint px-3.5 py-1.5 text-xs font-bold text-ink transition hover:brightness-105"
                  aria-label={`Download ${w.title} als pdf`}
                >
                  Downloaden
                </a>
              </li>
            ))}
          </ul>
          <Link href="/kennis/whitepapers" className="mt-6 inline-block text-sm font-semibold text-brand-mint hover:underline">
            Alle whitepapers →
          </Link>
        </div>
      </section>

      {/* Blogs teaser */}
      <Section tone="paper">
        <div id="blogs" className="scroll-mt-24" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead eyebrow="Blogs" title="Nieuws en achtergrond" />
          <Link href="/kennis/blog" className="text-sm font-semibold text-brand-600 hover:underline">
            Alle blogs →
          </Link>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {POSTS.slice(0, 3).map((p) => (
            <Link
              key={p.slug}
              href={`/kennis/blog/${p.slug}`}
              className="group flex flex-col rounded-2xl border border-hair bg-paper p-6 shadow-e1 transition-all hover:-translate-y-1 hover:shadow-e3"
            >
              <span className="font-mono text-xs uppercase tracking-wide text-neutralx-400">{nlDate(p.date)}</span>
              <h3 className="mt-2 font-display text-lg font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-neutralx-600">{p.excerpt}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                Lezen · {p.readMinutes} min
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <CtaBand
        title="Nog een vraag?"
        body="Staat je antwoord er niet bij? Bekijk de veelgestelde vragen of mail ons rechtstreeks."
        primaryHref="/kennis/faq"
        primaryLabel="Veelgestelde vragen"
        secondaryHref="mailto:info@zekerflex.com"
        secondaryLabel="info@zekerflex.com"
      />
    </>
  );
}
