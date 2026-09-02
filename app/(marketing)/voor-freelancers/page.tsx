import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { HeroChecks } from "@/components/marketing/HeroChecks";
import { Photo } from "@/components/marketing/Photo";
import { SceneWork } from "@/components/marketing/Scene";

export const metadata: Metadata = {
  title: "Voor freelancers",
  description:
    "Werk dat past bij je vak en je reistijd. Zelf kiezen hoe snel je uitbetaald wordt, zonder facturen sturen, altijd Wet DBA-proof.",
};

const BENEFITS = [
  {
    id: "matching",
    title: "Aanbod dat klopt",
    body: "Je geeft je vak, je thuisbasis en je beschikbaarheid op. Wij laten alleen diensten zien waar je een sterke match voor bent — gewogen op reistijd, reviews en je badge-niveau.",
  },
  {
    id: "uitbetaling",
    title: "Jij kiest je uitbetaling",
    body: "Je krijgt niet automatisch meteen betaald — je kiest per dienst. Gratis wachten tot de opdrachtgever afrekent binnen 30 dagen, of sneller tegen een fee: bij goedkeuring van je uren (4%), binnen 3 dagen (2%) of direct. Een voorschot op openstaande diensten kan ook (3%).",
  },
  {
    id: "facturen",
    title: "Geen facturen sturen",
    body: "ZekerFlex werkt met reverse billing. De factuur voor je dienst wordt automatisch aangemaakt met de juiste btw-behandeling — ook bij intra-EU opdrachten.",
  },
  {
    id: "verzekering",
    title: "Verzekerd tijdens je klus",
    body: "Elke opdracht via ZekerFlex valt onder een bedrijfs- en beroepsaansprakelijkheids- en ongevallendekking. Je verzekeringsbewijs staat als pdf in je dashboard.",
  },
  {
    id: "kyc",
    title: "Eén keer verifiëren",
    body: "Je koppelt je KVK en doorloopt een korte identiteitscheck (KYC). Daarna kun je direct diensten aannemen; je hoeft niets opnieuw aan te leveren.",
  },
  {
    id: "dba",
    title: "Altijd Wet DBA-proof",
    body: "Elke opdracht loopt onder een goedgekeurde modelovereenkomst. Het platform bewaakt je urenverdeling zodat je nooit onbedoeld te afhankelijk wordt van één opdrachtgever.",
  },
  {
    id: "badges",
    title: "Bouw je reputatie op",
    body: "Van Brons naar Platina: hoe betrouwbaarder je werkt, hoe meer en hoogwaardiger werk je krijgt aangeboden — en hoe hoger je directe uitbetaallimiet.",
  },
];

const FAQ = [
  { q: "Wat heb ik nodig om te beginnen?", a: "Een geldige KVK-inschrijving als zzp'er en een identiteitsbewijs voor de verificatie. Verder een rekeningnummer voor de uitbetalingen." },
  { q: "Kost het mij iets?", a: "Nee. Meedoen als freelancer is volledig gratis. De platformfee wordt bij de opdrachtgever in rekening gebracht." },
  { q: "Wanneer krijg ik precies betaald?", a: "Dat bepaal je zelf per dienst. Standaard wacht je gratis tot de opdrachtgever binnen 30 dagen afrekent. Wil je eerder je geld, dan kies je een snellere uitbetaling tegen een fee: bij urengoedkeuring (4% van de factuur), binnen 3 dagen (2%) of direct. Een voorschot van maximaal 80% op openstaande diensten kan tegen 3%." },
  { q: "Wat als er een geschil is over mijn uren?", a: "Dan wordt de betaling voor die dienst aangehouden tot een dispuutmanager ernaar heeft gekeken. Je GPS check-in en de goedgekeurde planning wegen daarin mee." },
];

export default function VoorFreelancersPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell grid gap-12 py-20 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-28">
          <div>
            <p className="eyebrow text-brand-mint">Voor freelancers</p>
            <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">
              Werk dat bij je past. Geld dat op tijd komt.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/70">
              Jij levert vakmanschap. Wij regelen de match, de overeenkomst, de
              factuur en de uitbetaling — zodat jij je op je werk kunt richten.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="btn-mint">
                Maak je profiel aan
              </Link>
              <Link href="/prijzen" className="btn-ghost-invert">
                Bekijk de voorwaarden
              </Link>
            </div>
            <HeroChecks items={["Bepaal je eigen uurtarief", "Kies je eigen klussen", "Bouw aan jouw toekomst"]} />
          </div>
          <Photo name="freelancer" fallback={<SceneWork />} className="shadow-lift" />
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow="Wat je krijgt" title="Alles geregeld, behalve het werk zelf" />
        <div className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-2">
          {BENEFITS.map((b) => (
            <div key={b.id} id={b.id} className="scroll-mt-24">
              <h3 className="font-display text-xl font-semibold">{b.title}</h3>
              <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">{b.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Zo werkt het" title="Van aanmelding tot eerste uitbetaling" />
        <ol className="mt-12 space-y-6">
          {[
            "Maak je account aan en koppel je KVK.",
            "Doorloop de identiteitsverificatie (5 minuten).",
            "Stel je vak, thuisbasis en beschikbaarheid in.",
            "Accepteer een dienst die bij je past.",
            "Check in op locatie en werk je dienst.",
            "Uren goedgekeurd → kies zelf hoe snel je uitbetaald wilt worden.",
          ].map((step, i) => (
            <li key={step} className="flex gap-4">
              <span className="num flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 font-mono text-sm text-white">
                {i + 1}
              </span>
              <span className="pt-1 text-[0.975rem] text-ink-soft">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Veelgestelde vragen" title="Goed om te weten" />
        <div className="mt-10">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand
        title="Klaar om aan de slag te gaan?"
        body="Je profiel staat in een paar minuten. Gratis, geen verplichtingen."
        primaryLabel="Profiel aanmaken"
        secondaryLabel="Voor bedrijven"
        secondaryHref="/voor-bedrijven"
      />
    </>
  );
}
