import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { HeroChecks } from "@/components/marketing/HeroChecks";
import { Photo } from "@/components/marketing/Photo";
import { SceneApprove } from "@/components/marketing/Scene";

export const metadata: Metadata = {
  title: "Voor bedrijven",
  description:
    "Betrouwbare zzp'ers, precies wanneer je ze nodig hebt. Automatische matching per vestiging, GPS check-in en Wet DBA-bewaking ingebouwd.",
};

const BLOCKS = [
  {
    id: "matching",
    title: "Automatische matching per vestiging",
    body: "Stel per locatie in wie automatisch mag worden toegewezen en vanaf welke matchscore. Nieuwe diensten worden direct bij de beste kandidaten uitgezet, in golven, tot de dienst vol is.",
  },
  {
    id: "checkin",
    title: "GPS check-in en urengoedkeuring",
    body: "Krachten checken in op locatie; de check-in wordt gegeofenced tegen je vestiging. Uren keur je met één klik goed — een afwijkende locatie opent automatisch een dispuut.",
  },
  {
    id: "facturatie",
    title: "Facturatie zonder gedoe",
    body: "Na goedkeuring worden de dienst- en platformfactuur automatisch aangemaakt, btw-correct en per kostenplaats te aggregeren. Geen losse facturen van tientallen zzp'ers.",
  },
  {
    id: "dba",
    title: "Wet DBA-risico's vóór ze een probleem zijn",
    body: "Het platform bewaakt urenconcentratie, opeenvolgende weken en omzetafhankelijkheid per relatie. Wordt het spannend, dan wordt de matching automatisch beperkt en krijg je een signaal.",
  },
];

const FAQ = [
  { q: "Wat kost het?", a: "€ 3,50 platformkosten per gewerkt uur. Je betaalt alleen wanneer er daadwerkelijk iemand werkt. Geen abonnement, geen opstart- of plaatsingskosten." },
  { q: "Hoe snel kan ik iemand hebben?", a: "Voor bekende functies op een vestiging met auto-toewijzing is dat vaak binnen enkele minuten. Anders gaat het aanbod in golven uit en zie je de reacties live binnenkomen." },
  { q: "Hoe zit het met de Wet DBA?", a: "Elke opdracht loopt onder een goedgekeurde modelovereenkomst. Daarnaast monitort ZekerFlex doorlopend de bekende risicosignalen en grijpt het in voordat een samenwerking als schijnzelfstandigheid kan worden gezien." },
  { q: "Kan ik meerdere vestigingen beheren?", a: "Ja. Je richt een organisatie in met vestigingen, wijst lokale managers toe met of zonder locatiebeperking, en houdt op hoofdkantoorniveau overzicht over alles." },
];

export default function VoorBedrijvenPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell grid gap-12 py-20 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-28">
          <div>
            <p className="eyebrow text-brand-mint">Voor bedrijven</p>
            <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">
              Betrouwbare mensen, precies wanneer je ze nodig hebt.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/70">
              Zet een dienst uit en ZekerFlex regelt de rest: de match, de
              overeenkomst, de check-in, de facturatie en de compliance.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register?type=bedrijf" className="btn-mint">
                Organisatie aanmelden
              </Link>
              <Link href="/prijzen" className="btn-ghost-invert">
                Bekijk de prijzen
              </Link>
            </div>
            <HeroChecks items={["24/7 beschikbaar", "100% controle", "Snel, makkelijk, flexibel"]} />
          </div>
          <Photo name="employerHero" fallback={<SceneApprove />} className="mx-auto w-full max-w-sm shadow-lift" />
        </div>
      </div>

      <Section tone="paper">
        <SectionHead
          eyebrow="Het systeem"
          title="Van dienst uitzetten tot factuur — één doorlopend proces"
        />
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {BLOCKS.map((b) => (
            <div key={b.id} id={b.id} className="card scroll-mt-24 p-7">
              <h3 className="font-display text-xl font-semibold">{b.title}</h3>
              <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">{b.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="hero-ink text-white">
        <div className="shell grid gap-10 py-16 sm:grid-cols-3">
          <div>
            <div className="num font-display text-4xl font-bold text-brand-mint">€ 3,50</div>
            <p className="mt-1 text-sm text-white/60">platformkosten per gewerkt uur — alleen bij gebruik</p>
          </div>
          <div>
            <div className="num font-display text-4xl font-bold text-brand-mint">€ 0</div>
            <p className="mt-1 text-sm text-white/60">opstart-, abonnement- en plaatsingskosten</p>
          </div>
          <div>
            <div className="num font-display text-4xl font-bold text-brand-mint">100%</div>
            <p className="mt-1 text-sm text-white/60">diensten onder een modelovereenkomst</p>
          </div>
        </div>
      </div>

      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Goed om te weten" />
        <div className="mt-10">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand
        title="Zet vandaag je eerste dienst uit"
        body="Meld je organisatie aan, richt je vestigingen in en nodig je managers uit. Binnen een uur operationeel."
        primaryHref="/register?type=bedrijf"
        primaryLabel="Organisatie aanmelden"
        secondaryLabel="Voor freelancers"
        secondaryHref="/voor-freelancers"
      />
    </>
  );
}
