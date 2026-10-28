import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { canonical } from "@/lib/seo";
import { PlatformFeeEstimate } from "@/components/marketing/PlatformFeeEstimate";

export const metadata: Metadata = {
  title: "Prijzen — € 3,50 per gewerkt uur, gratis voor freelancers",
  description:
    "Wat kost ZekerFlex? Gratis voor freelancers en flexkrachten. Bedrijven betalen € 3,50 platformkosten per gewerkt uur, alleen bij gebruik. Geen abonnement, geen opstartkosten, geen verrassingen.",
  keywords: ["zekerflex kosten", "zzp platform kosten", "uitzendbureau tarief", "flexpool prijs"],
  ...canonical("/prijzen"),
};

const FAQ = [
  { q: "Zijn er verborgen kosten?", a: "Nee. Voor freelancers is meedoen gratis. Voor bedrijven zijn er alleen de platformkosten van € 3,50 per gewerkt uur. Btw wordt regulier toegepast." },
  { q: "Wanneer wordt de fee voor bedrijven berekend?", a: "Op het moment dat goedgekeurde uren tot een uitbetaling leiden. Geen werk, geen fee." },
  { q: "Krijg ik korting bij veel uren?", a: "Ja. De platformkosten dalen met je volume deze maand: vanaf 500 uur € 3,25, vanaf 2.000 uur € 3,00, vanaf 10.000 uur € 2,75 en vanaf 50.000 uur € 2,50 per uur. Je ziet je staffel live in je werkgeversomgeving." },
  { q: "Betaalt een freelancer iets voor de uitbetaling?", a: "Alleen als je sneller wilt dan de reguliere termijn. Gratis wachten tot de opdrachtgever binnen 30 dagen afrekent, of eerder tegen een fee: bij urengoedkeuring 4% van de factuur, binnen 3 dagen 2%, of direct. Een voorschot van maximaal 80% op openstaande diensten kost 3%." },
  { q: "Kan ik een offerte op maat krijgen?", a: "Voor grotere organisaties met veel vestigingen kijken we naar volumeafspraken. Neem contact op via sales@zekerflex.com." },
  { q: "Wat kost de API?", a: "Los van de klusprijs: de publieke API heeft een gratis tier en betaalde abonnementen voor hogere limieten. Zie /developers voor de prijzen." },
];

export default function PrijzenPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">Prijzen</p>
          <h1 className="mt-4 font-display text-4xl font-bold md:text-6xl">
            Eerlijk en voorspelbaar
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Geen abonnement. Je betaalt alleen voor daadwerkelijk gewerkte uren;
            bij meer uren daalt je platformfee volgens een vaste, vooraf zichtbare staffel.
          </p>
        </div>
      </div>

      <Section tone="paper">
        <div className="grid gap-6 lg:grid-cols-2">
          <div id="freelancers" className="card flex scroll-mt-24 flex-col p-8">
            <p className="eyebrow">Freelancers</p>
            <div className="mt-4 font-display text-5xl font-bold">Gratis</div>
            <p className="mt-2 text-sm text-neutralx-600">Voor altijd. Meedoen kost je niets.</p>
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
            <Link href="/register" className="btn-primary mt-7 self-start">
              Profiel aanmaken
            </Link>
          </div>

          <div id="bedrijven" className="card relative flex scroll-mt-24 flex-col overflow-hidden p-8">
            <span className="absolute right-5 top-5 pill bg-mintwash text-brand-600">
              Populair
            </span>
            <p className="eyebrow">Bedrijven</p>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="num font-display text-5xl font-bold">€ 3,50</span>
              <span className="text-sm text-neutralx-500">per gewerkt uur</span>
            </div>
            <p className="mt-2 text-sm text-neutralx-600">
              Platformkosten per gewerkt uur. Alleen wanneer er iemand werkt — met staffelkorting bij veel uren.
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
            <Link href="/register?type=bedrijf" className="btn-primary mt-7 self-start">
              Organisatie aanmelden
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-neutralx-500">
          Alle bedragen exclusief btw. Uitbetalingen verlopen via SEPA. Wachten op de
          reguliere termijn is gratis; sneller uitbetalen kan tegen een fee (4% bij
          urengoedkeuring, 2% binnen 3 dagen, of direct).
        </p>
        <PlatformFeeEstimate />
      </Section>

      <Section tone="soft">
        <div id="api" className="scroll-mt-24" />
        <SectionHead
          eyebrow="Los van de klusprijs"
          title="API-toegang voor ontwikkelaars"
          intro="Een eigen systeem koppelen aan ZekerFlex (diensten lezen/aanmaken, uren ophalen, webhooks) is een los product met eigen abonnementen — de klusprijs hierboven blijft ongewijzigd."
        />
        <div className="mt-8">
          <Link href="/developers#pricing" className="btn-primary">
            Bekijk API-abonnementen
          </Link>
        </div>
      </Section>

      <Section tone="paper">
        <div id="faq" className="scroll-mt-24" />
        <SectionHead eyebrow="Veelgestelde vragen" title="Over de kosten" />
        <div className="mt-10">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand
        title="Begin vandaag"
        body="Aanmelden is gratis en kost een paar minuten. Je zit nergens aan vast."
      />
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
