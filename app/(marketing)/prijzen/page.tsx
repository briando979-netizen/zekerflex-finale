import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { seoMetadata } from "@/lib/ontwerp/seo-store";
import { PlatformFeeEstimate } from "@/components/marketing/PlatformFeeEstimate";
import { contentKeys, getContentMap } from "@/lib/content/store";
import { zichtbareSecties } from "@/lib/ontwerp/vaste-paginas";
import { getPaginaIndeling } from "@/lib/ontwerp/vaste-paginas-store";

// titel en omschrijving: de standaard in lib/ontwerp/seo.ts, of een eigen versie uit de Site-ontwerper (SEO)
export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/prijzen", { keywords: ["zekerflex kosten", "zzp platform kosten", "uitzendbureau tarief", "flexpool prijs"] });
}

const FAQ = [
  { q: "Zijn er verborgen kosten?", a: "Nee. Voor freelancers is meedoen gratis. Voor bedrijven zijn er alleen de platformkosten van € 3,50 per gewerkt uur. Btw wordt regulier toegepast." },
  { q: "Wanneer wordt de fee voor bedrijven berekend?", a: "Op het moment dat goedgekeurde uren tot een uitbetaling leiden. Geen werk, geen fee." },
  { q: "Krijg ik korting bij veel uren?", a: "Ja. De platformkosten dalen met je volume deze maand: vanaf 500 uur € 3,25, vanaf 2.000 uur € 3,00, vanaf 10.000 uur € 2,75 en vanaf 50.000 uur € 2,50 per uur. Je ziet je staffel live in je werkgeversomgeving." },
  { q: "Betaalt een freelancer iets voor de uitbetaling?", a: "Alleen als je sneller wilt dan de reguliere termijn. Gratis wachten tot de opdrachtgever binnen 30 dagen afrekent, of eerder tegen een fee: betaalopdracht direct indienen 4% van de factuur of binnen 3 werkdagen indienen 2%." },
  { q: "Kan ik een offerte op maat krijgen?", a: "Voor grotere organisaties met veel vestigingen kijken we naar volumeafspraken. Neem contact op via sales@zekerflex.com." },
  { q: "Kan ik ZekerFlex zelf aanbieden als bureau?", a: "Ja — als losse plugin via de API, als white-label platform onder je eigen merk, of volledig self-hosted op je eigen infrastructuur. Zie de pagina /voor-bureaus." },
  { q: "Wat kost de API?", a: "Los van de klusprijs: de publieke API heeft een gratis tier en betaalde abonnementen voor hogere limieten. Zie /developers voor de prijzen." },
];

export default async function PrijzenPage() {
  // teksten uit de Site-ontwerper (Teksten); bedragen en staffel blijven uit lib/pricing/tiers.ts
  const tekst = await getContentMap(contentKeys("pr."));
  const v = (k: string) => tekst[k] ?? "";
  // de onderdelen onder de kop: volgorde en zichtbaarheid uit de Site-ontwerper (Pagina's); zonder eigen indeling exact de standaard
  const onderdelen: Record<string, ReactNode> = {
    tarieven: (
      <Section tone="paper">
        <div className="grid gap-6 lg:grid-cols-2">
          <div id="freelancers" className="card flex scroll-mt-24 flex-col p-8">
            <p className="eyebrow" data-cms-key="pr.fl.label">{v("pr.fl.label")}</p>
            <div className="mt-4 font-display text-5xl font-bold">Gratis</div>
            <p className="mt-2 text-sm text-neutralx-600" data-cms-key="pr.fl.sub">{v("pr.fl.sub")}</p>
            <ul className="mt-6 flex-1 space-y-3 text-[0.95rem] text-neutralx-600">
              {[
                "Onbeperkt diensten aannemen",
                "Zelf kiezen hoe snel je uitbetaald wordt",
                "Automatische facturen (reverse billing)",
                "Modelovereenkomst en Wet DBA-bewaking",
                "Badge-progressie en hogere uitbetaallimieten",
              ].map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Tick /> {f}
                </li>
              ))}
            </ul>
            <Link href="/register" className="btn-primary mt-7 self-start" data-cms-key="pr.fl.knop">
              {v("pr.fl.knop")}
            </Link>
          </div>

          <div id="bedrijven" className="card relative flex scroll-mt-24 flex-col overflow-hidden p-8">
            <span className="absolute right-5 top-5 pill bg-mintwash text-brand-600" data-cms-key="pr.bv.badge">
              {v("pr.bv.badge")}
            </span>
            <p className="eyebrow" data-cms-key="pr.bv.label">{v("pr.bv.label")}</p>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="num font-display text-5xl font-bold">€ 3,50</span>
              <span className="text-sm text-neutralx-500">per gewerkt uur</span>
            </div>
            <p className="mt-2 text-sm text-neutralx-600" data-cms-key="pr.bv.sub" data-cms-ml="1">
              {v("pr.bv.sub")}
            </p>
            <div className="mt-4 grid grid-cols-5 gap-1 text-center text-[11px]">
              {[
                ["€ 3,50", "0+ u"],
                ["€ 3,25", "500+ u"],
                ["€ 3,00", "2.000+ u"],
                ["€ 2,75", "10.000+ u"],
                ["€ 2,50", "50.000+ u"],
              ].map(([p, h]) => (
                <span key={h} className="rounded-lg border border-hair px-1 py-1.5">
                  <span className="num block font-semibold text-ink">{p}</span>
                  <span className="block text-neutralx-500">{h}/mnd</span>
                </span>
              ))}
            </div>
            <ul className="mt-6 flex-1 space-y-3 text-[0.95rem] text-neutralx-600">
              {[
                "Automatische matching en toewijzing per vestiging",
                "GPS check-in en urengoedkeuring in één klik",
                "Geaggregeerde facturatie per kostenplaats",
                "Wet DBA-monitor met vroege signalen",
                "Onbeperkt vestigingen en managers",
                "Auditspoor van elke handeling",
              ].map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Tick /> {f}
                </li>
              ))}
            </ul>
            <Link href="/register?type=bedrijf" className="btn-primary mt-7 self-start" data-cms-key="pr.bv.knop">
              {v("pr.bv.knop")}
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-neutralx-500">
          Alle bedragen exclusief btw. Uitbetalingen verlopen via SEPA. Wachten op de
          reguliere termijn is gratis; sneller uitbetalen kan tegen een fee (4% bij
          urengoedkeuring, 2% bij indiening binnen 3 werkdagen, of direct).
        </p>
        <PlatformFeeEstimate />
        <p className="mt-5 text-center text-sm text-neutralx-600">
          Benieuwd wat je bespaart ten opzichte van een uitzendbureau?{" "}
          <Link href="/rekentools/kosten-uitzendkracht-berekenen" className="font-semibold text-brand-600 underline">
            Vergelijk de kosten per uur
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-neutralx-600">
          Liever een maandabonnement met extra modules (AI-recruiter, snelle uitbetaling, uitzend, bank)?{" "}
          <Link href="/abonnementen" className="font-semibold text-brand-600 underline">
            Bekijk de abonnementen
          </Link>
        </p>
      </Section>
    ),
    api: (
      <Section tone="soft">
        <div id="api" className="scroll-mt-24" />
        <SectionHead
          eyebrow={v("pr.api.eyebrow")}
          title={v("pr.api.title")}
          intro={v("pr.api.intro")}
          cms={{ eyebrow: "pr.api.eyebrow", title: "pr.api.title", intro: "pr.api.intro" }}
        />
        <div className="mt-8">
          <Link href="/developers#pricing" className="btn-primary" data-cms-key="pr.api.knop">
            {v("pr.api.knop")}
          </Link>
        </div>
      </Section>
    ),
    faq: (
      <Section tone="paper">
        <div id="faq" className="scroll-mt-24" />
        <SectionHead eyebrow={v("pr.faq.eyebrow")} title={v("pr.faq.title")} cms={{ eyebrow: "pr.faq.eyebrow", title: "pr.faq.title" }} />
        <div className="mt-10">
          <FaqList items={FAQ} />
        </div>
      </Section>
    ),
    slot: (
      <CtaBand
        title={v("pr.cta.title")}
        body={v("pr.cta.body")}
        primaryLabel={v("pr.cta.primary")}
        secondaryLabel={v("pr.cta.secondary")}
        cms={{ title: "pr.cta.title", body: "pr.cta.body", primary: "pr.cta.primary", secondary: "pr.cta.secondary" }}
      />
    ),
  };
  const zichtbaar = zichtbareSecties("prijzen", await getPaginaIndeling("prijzen"));
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint" data-cms-key="pr.eyebrow">{v("pr.eyebrow")}</p>
          <h1 className="mt-4 font-display text-4xl font-bold md:text-6xl" data-cms-key="pr.title">
            {v("pr.title")}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70" data-cms-key="pr.lead" data-cms-ml="1">
            {v("pr.lead")}
          </p>
        </div>
      </div>

      {zichtbaar.map((id) => (
        <Fragment key={id}>{onderdelen[id]}</Fragment>
      ))}
    </>
  );
}

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-1 flex-shrink-0 text-brand-500" aria-hidden>
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
