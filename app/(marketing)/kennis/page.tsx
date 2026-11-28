import { vt } from "@/lib/i18n/site";
import { getSiteT } from "@/lib/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand } from "@/components/marketing/primitives";
import { FotoKolom, HeroMetFoto } from "@/components/marketing/HeroMetFoto";
import { paginaFoto } from "@/lib/marketing/fotos";
import { GUIDES, POSTS, nlDate } from "@/lib/kennis/content";
import { WHITEPAPERS } from "@/lib/kennis/whitepapers";
import { canonical } from "@/lib/seo";

export const metadata: Metadata = {
  title: vt("Kennisbank — flexwerk, Wet DBA en uitbetaling"),
  description:
    vt("Gidsen, blogs en veelgestelde vragen over flexibel werken: Wet DBA, StiPP-pensioen, het ABU-fasensysteem, uitbetaling, facturen en verificatie."),
  ...canonical("/kennis"),
};

const INFO = [
  { t: "Wat is ZekerFlex?", b: "Eén platform waar werknemers en werkgevers elkaar vinden: slim gematcht op reistijd en vak, met flexibele uitbetaling en compliance ingebouwd." },
  { t: "Voor wie?", b: "Freelancers (zzp of flexwerker), uitzendkrachten via een aangesloten uitzendbureau, en bedrijven die flexibele bezetting nodig hebben." },
  { t: "Wat kost het?", b: "Gratis voor freelancers. Bedrijven betalen € 3,50 platformkosten per gewerkt uur — alleen bij gebruik." },
  { t: "Hoe ondersteunt ZekerFlex bij de Wet DBA?", b: "ZekerFlex legt afspraken vast en signaleert risico's. De feitelijke werkwijze blijft bepalend voor de beoordeling van de arbeidsrelatie." },
  { t: "Welke diensten gebruiken jullie?", b: "Voor onderdelen zoals hosting, betalingen, e-mail en identiteitscontroles gebruiken we gespecialiseerde dienstverleners. Bekijk ons privacybeleid voor meer informatie." },
  { t: "En mijn geld?", b: "Je kiest zelf: gratis wachten tot de opdrachtgever binnen 30 dagen afrekent, of sneller uitbetaald worden tegen een fee (4% bij directe indiening van de betaalopdracht of 2% bij indiening binnen 3 werkdagen)." },
];

export default async function KennisPage() {
  const tx = await getSiteT();
  return (
    <>
      <div className="hero-ink text-white">
      <div className="shell grid items-center gap-10 py-20 md:py-24 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="eyebrow text-brand-mint">{tx("Kennis")}</p>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
            {tx("Alles wat je wilt weten over flexibel werken via ZekerFlex")}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            {tx("Van de Wet DBA tot StiPP-pensioen en hoe je sneller uitbetaald krijgt. Kort, concreet en actueel.")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/kennis#kennisbank" className="btn-mint">
              {tx("Naar de kennisbank")}
            </Link>
            <Link href="/kennis/faq" className="btn-ghost-invert">
              {tx("Veelgestelde vragen")}
            </Link>
          </div>
        </div>
        <FotoKolom foto={paginaFoto("kennis")} />
        </div>
      </div>

      {/* Informatie */}
      <Section tone="paper">
        <div id="informatie" className="scroll-mt-24" />
        <SectionHead
          eyebrow={tx("Informatie")}
          title={tx("De basis in één oogopslag")}
          intro={tx("De belangrijkste vragen kort beantwoord. Wil je meer diepgang? Kijk in de kennisbank hieronder.")}
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
          eyebrow={tx("Kennisbank")}
          title={tx("Uitgelegde onderwerpen")}
          intro={tx("Diepere artikelen over de dingen die er echt toe doen als je flexibel werkt.")}
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {GUIDES.map((g) => (
            <Link
              key={g.slug}
              href={`/kennis/${g.slug}`}
              className="group flex flex-col rounded-2xl border border-hair bg-paper p-6 shadow-e1 transition-all hover:-translate-y-1 hover:shadow-e3"
            >
              <span className="pill w-fit bg-mintwash text-brand-600">{g.category}</span>
              <h3 className="mt-3 font-display text-lg font-semibold text-ink">{tx(g.title)}</h3>
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
          <p className="eyebrow text-brand-600">{tx("Voor opdrachtgevers")}</p>
          <h2 className="mt-3 max-w-2xl text-balance font-display text-2xl font-bold text-ink md:text-3xl">
            {tx("Mag ik morgen nog gewoon een freelancer inhuren?")}
          </h2>
          <p className="mt-3 max-w-xl text-neutralx-600">
            {tx("Schijnzelfstandigheid en handhaving, plus praktische hulp bij je account, facturatie, diensten plaatsen en uren goedkeuren.")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/kennis/wet-dba" className="btn-primary">
              {tx("Wet DBA-kenniscentrum")}
            </Link>
            <Link href="/kennis/werkgevers" className="btn-ghost">
              {tx("Helpcentrum voor opdrachtgevers")}
            </Link>
          </div>
        </div>
      </Section>

      {/* Whitepapers */}
      <section className="hero-ink text-white">
        <div id="whitepapers" className="scroll-mt-24" />
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">{tx("Whitepapers")}</p>
          <h2 className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold leading-tight md:text-4xl">
            {tx("Klik en download de whitepapers")}
          </h2>
          <p className="mt-4 max-w-xl text-white/65">
            {tx("De onderwerpen die er echt toe doen — als pdf in ZekerFlex-stijl om te bewaren.")}
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
                  {/* break-words: "kleineondernemersregeling" is één woord en liep op een telefoon onder de knop door */}
                  <span className="block break-words text-sm font-semibold text-white hyphens-auto">{tx(w.title)}</span>
                  <span className="block truncate text-xs text-white/50">{w.subtitle}</span>
                </Link>
                <a
                  href={`/api/kennis/whitepaper/${w.slug}`}
                  className="flex-shrink-0 rounded-full bg-brand-mint px-3.5 py-1.5 text-xs font-bold text-ink transition hover:brightness-105"
                  aria-label={`Download ${w.title} als pdf`}
                >
                  {tx("Downloaden")}
                </a>
              </li>
            ))}
          </ul>
          <Link href="/kennis/whitepapers" className="mt-6 inline-block text-sm font-semibold text-brand-mint hover:underline">
            {tx("Alle whitepapers →")}
          </Link>
        </div>
      </section>

      {/* Blogs teaser */}
      <Section tone="paper">
        <div id="blogs" className="scroll-mt-24" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead eyebrow={tx("Blogs")} title={tx("Nieuws en achtergrond")} />
          <Link href="/kennis/blog" className="text-sm font-semibold text-brand-600 hover:underline">
            {tx("Alle blogs →")}
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
              <h3 className="mt-2 font-display text-lg font-semibold text-ink">{tx(p.title)}</h3>
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
        title={tx("Nog een vraag?")}
        body={tx("Staat je antwoord er niet bij? Bekijk de veelgestelde vragen of mail ons rechtstreeks.")}
        primaryHref="/kennis/faq"
        primaryLabel={tx("Veelgestelde vragen")}
        secondaryHref="mailto:info@zekerflex.com"
        secondaryLabel={tx("info@zekerflex.com")}
      />
    </>
  );
}
