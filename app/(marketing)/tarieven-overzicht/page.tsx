import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand } from "@/components/marketing/primitives";
import { canonical } from "@/lib/seo";
import { BASE_FEE_PER_HOUR_CENTS } from "@/lib/pricing/tiers";
import { TARIEF_TIPS, TARIEVEN_PDF, TARIEVEN_TEKST, euro, staffelRijen, tariefGroepen } from "@/lib/kennis/tarieven-overzicht";

// Het tarievenoverzicht: richttarief per functie (lib/shifts/catalogus.ts) en de staffel van de platformkosten
// (lib/pricing/tiers.ts). De bedragen komen uit lib/kennis/tarieven-overzicht.ts, net als die in de pdf.
// De uitzendopslag is niet openbaar: hier alleen de verwijzing naar een offerte (tests/tarieven-overzicht.test.ts).

const TITLE = "Tarievenoverzicht: uurtarief per functie";
const DESCRIPTION =
  "Wat kost een flexkracht per uur? Het richttarief per functie en branche, met de platformkosten erbij. Ook als pdf om te bewaren.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ["tarieven flexwerk", "uurtarief zzp per functie", "kosten flexkracht per uur", "tarievenoverzicht"],
  ...canonical("/tarieven-overzicht"),
};

export default function TarievenOverzichtPage() {
  const groepen = tariefGroepen();
  const staffel = staffelRijen();
  const platform = euro(BASE_FEE_PER_HOUR_CENTS);
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <p className="eyebrow text-brand-mint">Tarievenoverzicht</p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-tight md:text-6xl">
            Wat kost een flexkracht per uur?
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-white/70">{TARIEVEN_TEKST.intro}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={TARIEVEN_PDF} className="btn-mint">
              Download het overzicht (pdf)
            </a>
            <Link href="/klus-plaatsen" className="btn-ghost-invert">
              Plaats een klus
            </Link>
          </div>
          <p className="mt-4 text-sm text-white/70">
            Direct downloaden, zonder je gegevens in te vullen.{" "}
            <Link href="/prijzen" className="font-semibold text-brand-mint underline">
              Bekijk de prijzen
            </Link>
          </p>
        </div>
      </div>

      <Section tone="paper" id="functies">
        <SectionHead eyebrow="Per branche" title="Richttarief per functie" intro={TARIEVEN_TEKST.lezen} />
        <ul className="mt-6 space-y-1.5 text-sm text-neutralx-600">
          <li>
            <strong className="font-semibold text-ink">Richttarief:</strong> het uurtarief dat ZekerFlex voorstelt voor deze functie.
          </li>
          <li>
            <strong className="font-semibold text-ink">Platformkosten:</strong> {platform} per gewerkt uur.
          </li>
          <li>
            <strong className="font-semibold text-ink">Samen:</strong> richttarief plus platformkosten, wat je per uur betaalt voor een zelfstandige.
          </li>
        </ul>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {groepen.map((g) => (
            <div key={g.branche} id={g.branche} className="card scroll-mt-24 p-5 md:p-7">
              <h3 id={`kop-${g.branche}`} className="font-display text-xl font-bold text-ink">
                {g.label}
              </h3>
              {/* relative: de sr-only caption blijft binnen de vegende rij (AGENTS.md); op de telefoon zonder de kolom Platformkosten */}
              <div className="relative mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm" aria-labelledby={`kop-${g.branche}`}>
                  <caption className="sr-only">{g.label}: tarieven per uur, exclusief btw</caption>
                  <thead>
                    <tr className="border-b border-hair text-neutralx-500">
                      <th scope="col" className="py-2 pr-3 font-semibold">
                        Functie
                      </th>
                      <th scope="col" className="py-2 pr-3 text-right font-semibold">
                        Richttarief per uur
                      </th>
                      <th scope="col" className="hidden py-2 pr-3 text-right font-semibold sm:table-cell">
                        Platformkosten
                      </th>
                      <th scope="col" className="py-2 text-right font-semibold">
                        Samen per uur
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rijen.map((r) => (
                      <tr key={r.key} className="border-b border-hair last:border-b-0">
                        <th scope="row" className="py-2.5 pr-3 font-medium text-ink">
                          {r.functie}
                        </th>
                        <td className="num whitespace-nowrap py-2.5 pr-3 text-right text-ink">{euro(r.richtCents)}</td>
                        <td className="num hidden whitespace-nowrap py-2.5 pr-3 text-right text-neutralx-600 sm:table-cell">{euro(r.platformCents)}</td>
                        <td className="num whitespace-nowrap py-2.5 text-right font-semibold text-ink">{euro(r.samenCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-neutralx-500">
          Alle bedragen zijn per uur en exclusief btw. Het richttarief is een voorstel: jij bepaalt zelf het tarief van je klus.
        </p>
      </Section>

      <Section tone="soft" id="platformkosten">
        <SectionHead eyebrow="Platformkosten" title="Hoe meer uren, hoe lager de platformkosten" intro={TARIEVEN_TEKST.staffel} />
        <div className="mt-8 max-w-2xl rounded-2xl border border-hair bg-white p-5 md:p-7">
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Platformkosten per gewerkt uur, exclusief btw</caption>
              <thead>
                <tr className="border-b border-hair text-neutralx-500">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Gewerkte uren
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    Platformkosten per uur
                  </th>
                </tr>
              </thead>
              <tbody>
                {staffel.map((s) => (
                  <tr key={s.naam} className="border-b border-hair last:border-b-0">
                    <th scope="row" className="py-2.5 pr-3 font-medium text-ink">
                      {s.uren}
                    </th>
                    <td className="num whitespace-nowrap py-2.5 text-right font-semibold text-ink">{euro(s.centsPerUur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-6 text-sm text-neutralx-600">
          Geen werk, geen kosten. Meer over de kosten lees je op de{" "}
          <Link href="/prijzen" className="font-semibold text-brand-600 underline">
            prijzenpagina
          </Link>
          .
        </p>
      </Section>

      <Section tone="paper" id="zelfstandige-of-uitzendkracht">
        <SectionHead eyebrow="Twee manieren" title="Zelfstandige of uitzendkracht" />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="card p-7">
            <h3 className="font-display text-xl font-semibold text-ink">Een zelfstandige</h3>
            <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">{TARIEVEN_TEKST.zelfstandige}</p>
            <Link href="/klus-plaatsen" className="mt-5 inline-block text-sm font-semibold text-brand-600 underline">
              Stel je klus samen en zie de kosten
            </Link>
          </div>
          <div className="card p-7">
            <h3 className="font-display text-xl font-semibold text-ink">Een uitzendkracht</h3>
            <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">{TARIEVEN_TEKST.uitzend}</p>
            <p className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link href="/uitzendbureau" className="font-semibold text-brand-600 underline">
                Uitzendkrachten aanvragen
              </Link>
              <Link href="/contact" className="font-semibold text-brand-600 underline">
                Neem contact op
              </Link>
            </p>
          </div>
        </div>
      </Section>

      <Section tone="soft" id="tips">
        <SectionHead eyebrow="Je eigen tarief" title="Vijf tips voor een tarief dat reacties krijgt" />
        <ol className="mt-10 grid gap-6 md:grid-cols-2">
          {TARIEF_TIPS.map((tip, i) => (
            <li key={tip.titel} className="card p-7">
              <p className="num font-display text-sm font-bold text-brand-600">Tip {i + 1}</p>
              <h3 className="mt-1 font-display text-lg font-semibold text-ink">{tip.titel}</h3>
              <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">{tip.tekst}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <a href={TARIEVEN_PDF} className="btn-primary">
            Download het overzicht (pdf)
          </a>
          <span className="text-sm text-neutralx-500">Dezelfde bedragen, om te bewaren of door te sturen.</span>
        </div>
      </Section>

      <CtaBand
        title="Weten wat jouw klus kost?"
        body="Stel je klus samen zonder account en zie meteen wat het kost."
        primaryHref="/klus-plaatsen"
        primaryLabel="Plaats een klus"
        secondaryHref="/prijzen"
        secondaryLabel="Bekijk de prijzen"
      />
    </>
  );
}
