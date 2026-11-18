import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, FaqList, Section, SectionHead } from "@/components/marketing/primitives";
import { StapNummer, VerkopenNav } from "@/components/marketing/Verkopen";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { LANDEN, RUBRIEKEN, STAPPEN, START_FAQ, VERKOPEN_PAD, VERKOPEN_START_PAD, VERKOPER_AANMELD_PAD, VERKOPERSOMGEVING_PAD, rubriekPad } from "@/lib/shop/partnerplatform";

const title = "Start met verkopen via ZekerFlex";
const description =
  "Meld je bedrijf aan als verkoper in de ZekerFlex-shop. Zes stappen: account, bedrijf verifiëren, voorwaarden, rekening, eerste producten en verkopen. Met de antwoorden op de meest gestelde vragen.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["start met verkopen", "verkoper worden", "producten verkopen zekerflex", "aanmelden als verkoper"],
  ...canonical(VERKOPEN_START_PAD, { title, description }),
};

// /verkopen/start (18 nov 2026): aanmelden als verkoper. Geen tweede aanmeldflow: de knoppen leiden naar de gewone
// aanmelding voor een bedrijf (/register) of naar de bestaande verkopersomgeving (Studio → Verkopen). Verkopen kan nu met
// een Nederlands KVK-nummer; de andere kaarten zeggen eerlijk "nog niet" en verwijzen naar de contactpagina.

export default function StartMetVerkopenPage() {
  const kruimels = breadcrumbJsonLd([
    ["Home", "/"],
    ["Partnerplatform", VERKOPEN_PAD],
    ["Start met verkopen", VERKOPEN_START_PAD],
  ]);
  const vragen = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: START_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson([kruimels, vragen]) }} />
      <VerkopenNav actief="start" />

      <div className="hero-ink text-white">
        <div className="shell py-14 md:py-20">
          <p className="eyebrow text-brand-mint">Partnerplatform</p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-tight md:text-6xl">Start met verkopen via ZekerFlex</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/70">Je producten in de ZekerFlex-shop, onder je eigen bedrijfsnaam. Aanmelden kost niets; je betaalt alleen commissie over wat je verkoopt.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={VERKOPER_AANMELD_PAD} className="btn-mint">
              Account maken
            </Link>
            <Link href={VERKOPERSOMGEVING_PAD} className="btn-ghost-invert">
              Ik heb al een account
            </Link>
          </div>
        </div>
      </div>

      <Section tone="paper" id="land">
        <SectionHead eyebrow="Stap vooraf" title="Waar is jouw bedrijf gevestigd?" intro="We controleren elk bedrijf voordat het verkoopt. Dat kan nu voor bedrijven in Nederland." />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {LANDEN.map((l) => (
            <div key={l.sleutel} className={`flex flex-col rounded-2xl border p-6 ${l.kan ? "border-ink bg-white" : "border-hair bg-paper-soft"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">{l.kan ? "Kan nu" : "Nog niet"}</p>
              <h3 className="mt-1 font-display text-xl font-bold text-ink">{l.naam}</h3>
              <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">{l.tekst}</p>
              <div className="mt-auto pt-5">
                <Link href={l.href} className={l.kan ? "btn-primary" : "inline-flex items-center rounded-lg border border-hairstrong bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-ink"}>
                  {l.knop}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="soft" id="stappen">
        <SectionHead eyebrow="Aanmelden" title="Hoe werkt het aanmeldproces" intro="Zes stappen. Bij elke stap staat hoe lang het duurt." />
        <ol className="mt-8 grid gap-4 md:grid-cols-2">
          {STAPPEN.map((s, i) => (
            <li key={s.titel} className="flex gap-4 rounded-2xl border border-hair bg-white p-6">
              <StapNummer n={i + 1} />
              <div>
                <h3 className="font-display text-lg font-bold text-ink">
                  <span className="mr-1 text-neutralx-500">Stap {i + 1}:</span> {s.titel}
                </h3>
                <p className="mt-1 text-[0.975rem] leading-relaxed text-neutralx-600">{s.tekst}</p>
                <p className="mt-3 inline-block rounded-full bg-paper-soft px-3 py-1 text-xs font-semibold text-neutralx-700">Tijd: {s.tijd}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={VERKOPER_AANMELD_PAD} className="btn-primary">
            Account maken
          </Link>
          <Link href={VERKOPERSOMGEVING_PAD} className="inline-flex items-center rounded-lg border border-hairstrong bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-ink">
            Ik heb al een account
          </Link>
        </div>
      </Section>

      <Section tone="paper" id="vragen">
        <SectionHead eyebrow="Veelgestelde vragen" title="Goed om te weten" />
        <div className="mt-8">
          <FaqList items={START_FAQ} />
        </div>
      </Section>

      <Section tone="soft" id="verder">
        <SectionHead eyebrow="Verder groeien" title="Lees je in voordat je begint" intro="Per onderwerp de regels zoals ze nu gelden." />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {RUBRIEKEN.map((r) => (
            <Link key={r.slug} href={rubriekPad(r.slug)} className="rounded-2xl border border-hair bg-white p-5 transition hover:border-ink">
              <p className="font-display text-base font-bold text-ink">{r.naam}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{r.kort}</p>
            </Link>
          ))}
        </div>
      </Section>

      <CtaBand
        title="Klaar voor je eerste verkoop?"
        body="Maak een account voor je bedrijf. Daarna vind je Verkopen in je webshop-omgeving."
        primaryHref={VERKOPER_AANMELD_PAD}
        primaryLabel="Account maken"
        secondaryHref={VERKOPEN_PAD}
        secondaryLabel="Naar het Partnerplatform"
      />
    </>
  );
}
