import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { HeroChecks } from "@/components/marketing/HeroChecks";
import { Photo } from "@/components/marketing/Photo";
import { SceneWork } from "@/components/marketing/Scene";
import { seoMetadata } from "@/lib/ontwerp/seo-store";
import { contentKeys, getContentMap } from "@/lib/content/store";

// titel en omschrijving: de standaard in lib/ontwerp/seo.ts, of een eigen versie uit de Site-ontwerper (SEO)
export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/voor-freelancers", {
    keywords: [
      "zzp klus vinden",
      "flexwerk vinden",
      "freelance opdrachten",
      "bijbaan direct uitbetaald",
      "zelfde dag uitbetaald",
      "werk in de buurt",
      "freelance werk zonder tussenpersoon",
    ],
  });
}

const BENEFITS = [
  {
    id: "matching",
    title: "Aanbod dat klopt",
    body: "Je geeft je vak, je thuisbasis en je beschikbaarheid op. Wij laten alleen diensten zien waar je een sterke match voor bent — gewogen op reistijd, reviews en je badge-niveau.",
  },
  {
    id: "uitbetaling",
    title: "Jij kiest je uitbetaling",
    body: "Je krijgt niet automatisch meteen betaald — je kiest per dienst. Gratis wachten tot de opdrachtgever afrekent binnen 30 dagen, of sneller tegen een fee: betaalopdracht direct indienen (4%) of binnen 3 werkdagen indienen (2%).",
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
    title: "Afspraken en risicosignalen",
    body: "ZekerFlex legt afspraken per opdrachtgever vast en signaleert onder meer urenconcentratie. De feitelijke werkwijze blijft bepalend voor de beoordeling van de arbeidsrelatie.",
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
  { q: "Wanneer krijg ik precies betaald?", a: "Dat bepaal je zelf per dienst. Standaard wacht je gratis tot de opdrachtgever binnen 30 dagen afrekent. Wil je eerder je geld, dan kies je een snellere uitbetaling tegen een fee: betaalopdracht direct indienen (4% van de factuur) of binnen 3 werkdagen indienen (2%)." },
  { q: "Wat als er een geschil is over mijn uren?", a: "Dan wordt de betaling voor die dienst aangehouden tot een dispuutmanager ernaar heeft gekeken. Je GPS check-in en de goedgekeurde planning wegen daarin mee." },
];

export default async function VoorFreelancersPage() {
  // teksten uit de Site-ontwerper (Teksten); zonder eigen versie exact de standaard
  const tekst = await getContentMap(contentKeys("vf."));
  const v = (k: string) => tekst[k] ?? "";
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell grid gap-12 py-20 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-28">
          <div>
            <p className="eyebrow text-brand-mint" data-cms-key="vf.eyebrow">{v("vf.eyebrow")}</p>
            <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl" data-cms-key="vf.title">
              {v("vf.title")}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/70" data-cms-key="vf.lead" data-cms-ml="1">
              {v("vf.lead")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="btn-mint" data-cms-key="vf.cta1">
                {v("vf.cta1")}
              </Link>
              <Link href="/prijzen" className="btn-ghost-invert" data-cms-key="vf.cta2">
                {v("vf.cta2")}
              </Link>
            </div>
            <HeroChecks items={["Bepaal je eigen uurtarief", "Kies je eigen klussen", "Bouw aan jouw toekomst"]} />
          </div>
          <Photo name="freelancer" fallback={<SceneWork />} className="shadow-lift" />
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow={v("vf.got.eyebrow")} title={v("vf.got.title")} cms={{ eyebrow: "vf.got.eyebrow", title: "vf.got.title" }} />
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
        <SectionHead eyebrow={v("vf.how.eyebrow")} title={v("vf.how.title")} cms={{ eyebrow: "vf.how.eyebrow", title: "vf.how.title" }} />
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
        <SectionHead eyebrow={v("vf.faq.eyebrow")} title={v("vf.faq.title")} cms={{ eyebrow: "vf.faq.eyebrow", title: "vf.faq.title" }} />
        <div className="mt-10">
          <FaqList items={FAQ} />
        </div>
        <p className="mt-8 text-[0.975rem] text-neutralx-600">
          Twijfel je welk uurtarief je moet vragen?{" "}
          <Link href="/rekentools/zzp-uurtarief-berekenen" className="font-semibold text-brand-600 underline">
            Bereken je uurtarief
          </Link>
        </p>
      </Section>

      <CtaBand
        title={v("vf.cta.title")}
        body={v("vf.cta.body")}
        primaryLabel={v("vf.cta.primary")}
        secondaryLabel={v("vf.cta.secondary")}
        secondaryHref="/voor-bedrijven"
        cms={{ title: "vf.cta.title", body: "vf.cta.body", primary: "vf.cta.primary", secondary: "vf.cta.secondary" }}
      />
    </>
  );
}
