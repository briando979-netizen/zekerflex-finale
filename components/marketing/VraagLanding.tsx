import Link from "next/link";
import { ldJson } from "@/lib/seo/json-ld";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { LinkRij } from "@/components/marketing/StadCijfers";
import { nlDate } from "@/lib/kennis/content";
import {
  BEDRIJFS_VRAGEN,
  BEDRIJFS_VRAGEN_KOP,
  VRAGEN_KOP,
  VRAGEN_PAD,
  isExtern,
  vraagJsonLd,
  vraagLink,
  vraagPad,
  vragenHubJsonLd,
  vragenVoor,
  type BedrijfsVraag,
  type VraagSectie,
} from "@/lib/seo-vragen";

// /vragen en /vragen/<vraag> (22 nov 2026): korte antwoorden voor bedrijven (lib/seo-vragen.ts). Zelfde opbouw als een
// kennisartikel (app/(marketing)/kennis/[slug]/page.tsx): donkere kop met de vraag als h1 en meteen het antwoord, dan de
// uitleg, de bronnen en de vragen. Plus het blok met links voor /bedrijven en de branchehubs. Servercomponenten.

const KLUS = { href: "/klus-plaatsen", label: "Gratis klus plaatsen" };
const BEDRIJVEN = { href: "/bedrijven", label: "Zo werkt het voor bedrijven" };

function Knoppen() {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link href={KLUS.href} className="btn-mint">
        {KLUS.label}
      </Link>
      <Link href={BEDRIJVEN.href} className="btn-ghost-invert">
        {BEDRIJVEN.label}
      </Link>
    </div>
  );
}

function Blok({ s }: { s: VraagSectie }) {
  return (
    <section className="mt-12 first:mt-0">
      <h2 className="font-display text-xl font-bold text-ink md:text-2xl">{s.kop}</h2>
      {s.alineas.map((a, i) => (
        <p key={i} className="mt-4 text-[1.02rem] leading-relaxed text-neutralx-700">
          {a}
        </p>
      ))}
      {s.lijst.length > 0 ? (
        <ul className="mt-4 space-y-2 text-[1.02rem] leading-relaxed text-neutralx-700">
          {s.lijst.map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {s.tabel ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="mb-2 text-left font-semibold text-ink">{s.tabel.kop}</caption>
            <thead>
              <tr className="border-b border-hairstrong text-neutralx-500">
                {s.tabel.kolommen.map((k, i) => (
                  <th key={`${i}-${k}`} scope="col" className="py-2 pr-4 align-bottom font-medium">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.tabel.rijen.map((r) => (
                <tr key={r[0] ?? ""} className="border-b border-hair align-top">
                  {r.map((cel, i) =>
                    i === 0 ? (
                      <th key={i} scope="row" className="py-2 pr-4 font-semibold text-ink">
                        {cel}
                      </th>
                    ) : (
                      <td key={i} className="py-2 pr-4 text-neutralx-700">
                        {cel}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function Bronnen({ v }: { v: BedrijfsVraag }) {
  return (
    <section className="mt-12 border-t border-hair pt-8">
      <h2 className="font-display text-lg font-bold text-ink">Bronnen</h2>
      <ul className="mt-3 space-y-1.5 text-sm text-neutralx-600">
        {v.bronnen.map((b) => (
          <li key={`${b.href}-${b.label}`}>
            {isExtern(b.href) ? (
              <a href={b.href} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                {b.label}
              </a>
            ) : (
              <Link href={b.href} className="font-semibold text-brand-600 hover:underline">
                {b.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {v.noot ? <p className="mt-4 text-xs text-neutralx-500">{v.noot}</p> : null}
    </section>
  );
}

// ---- /vragen/<vraag> -----------------------------------------------------------
export function VraagLanding({ vraag: v }: { vraag: BedrijfsVraag }) {
  const anderen = BEDRIJFS_VRAGEN.filter((x) => x.slug !== v.slug).map(vraagLink);
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(vraagJsonLd(v)) }}
      />
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <Link href={VRAGEN_PAD} className="text-sm font-medium text-white/60 hover:text-white">
            ← {VRAGEN_KOP}
          </Link>
          <p className="eyebrow mt-6 text-brand-mint">Voor bedrijven · bijgewerkt {nlDate(v.bijgewerkt)}</p>
          <h1 className="mt-3 max-w-3xl text-balance font-display text-3xl font-bold leading-tight md:text-[2.7rem]">{v.vraag}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/80">{v.antwoord}</p>
          <Knoppen />
        </div>
      </div>

      <article className="bg-paper">
        <div className="shell max-w-3xl py-14 md:py-16">
          {v.secties.map((s) => (
            <Blok key={s.kop} s={s} />
          ))}
          <Bronnen v={v} />
        </div>
      </article>

      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Vragen die hierbij horen" />
        <div className="mt-8 max-w-3xl">
          <FaqList items={[...v.faq]} />
        </div>
        <LinkRij kop={BEDRIJFS_VRAGEN_KOP} links={[...anderen, { href: VRAGEN_PAD, label: "Alle vragen" }]} />
        <LinkRij kop="Personeel inhuren" links={[{ href: "/personeel-inhuren", label: "Per stad en per branche" }, { href: "/tarieven-overzicht", label: "Tarievenoverzicht" }, BEDRIJVEN]} />
      </Section>

      <CtaBand
        title="Zelf kijken wat je klus kost?"
        body="Stel je klus samen zonder account en zie meteen het uurtarief en de platformkosten. Je betaalt alleen voor gewerkte uren."
        primaryHref={KLUS.href}
        primaryLabel="Klus plaatsen"
        secondaryHref={BEDRIJVEN.href}
        secondaryLabel="Voor bedrijven"
      />
    </>
  );
}

// ---- /vragen -------------------------------------------------------------------
export function VragenHub() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(vragenHubJsonLd()) }}
      />
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <p className="eyebrow text-brand-mint">Voor bedrijven · korte antwoorden</p>
          <h1 className="mt-3 max-w-3xl text-balance font-display text-3xl font-bold leading-tight md:text-[2.7rem]">{VRAGEN_KOP}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/80">
            Korte, feitelijke antwoorden op wat bedrijven het vaakst vragen over personeel inhuren: wat het kost, wie de werkgever is en wat de Wet DBA vraagt. Bij elk antwoord staan de bronnen.
          </p>
          <Knoppen />
        </div>
      </div>
      <Section>
        <ul className="grid gap-5 md:grid-cols-2">
          {BEDRIJFS_VRAGEN.map((v) => (
            <li key={v.slug} className="flex flex-col rounded-2xl border border-hair bg-white p-6">
              <h2 className="font-display text-lg font-bold text-ink">
                <Link href={vraagPad(v)} className="hover:text-brand-600">
                  {v.vraag}
                </Link>
              </h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-neutralx-600">{v.antwoord}</p>
              <Link href={vraagPad(v)} className="mt-4 text-sm font-semibold text-brand-600 hover:underline">
                Lees het hele antwoord
              </Link>
            </li>
          ))}
        </ul>
        <LinkRij
          kop="Meer voor bedrijven"
          links={[
            { href: "/personeel-inhuren", label: "Personeel inhuren per stad" },
            { href: "/tarieven-overzicht", label: "Tarievenoverzicht" },
            { href: "/kennis/wet-dba", label: "Wet DBA-kenniscentrum" },
            { href: "/rekentools/kosten-uitzendkracht-berekenen", label: "Kosten uitzendkracht berekenen" },
            BEDRIJVEN,
          ]}
        />
      </Section>
      <CtaBand
        title="Staat je vraag er niet bij?"
        body="Stel je klus samen zonder account, of mail info@zekerflex.com."
        primaryHref={KLUS.href}
        primaryLabel="Klus plaatsen"
        secondaryHref={BEDRIJVEN.href}
        secondaryLabel="Voor bedrijven"
      />
    </>
  );
}

// ---- het blok op /bedrijven en de branchehubs ------------------
/** "Veelgestelde vragen voor bedrijven": een link per vraag (die van de branche eerst) en naar het overzicht. */
export function BedrijfsVragen({ branche, kop = "h3", className = "mt-10" }: { branche?: string; kop?: "h2" | "h3"; className?: string }) {
  const Kop = kop;
  return (
    <div className={className}>
      <Kop className="font-display text-lg font-bold text-ink">{BEDRIJFS_VRAGEN_KOP}</Kop>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {vragenVoor(branche).map((v) => (
          <li key={v.slug}>
            <Link href={vraagPad(v)} className="block h-full rounded-xl border border-hair bg-white px-4 py-3 text-sm font-semibold text-ink hover:border-brand-500">
              {v.vraag}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        <Link href={VRAGEN_PAD} className="font-semibold text-brand-600 hover:underline">
          Alle vragen van bedrijven
        </Link>
      </p>
    </div>
  );
}
