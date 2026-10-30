import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { canonical } from "@/lib/seo";
import { PartnerPlans } from "@/components/marketing/PartnerPlans";

const title = "ZekerFlex voor bureaus — plugin, white-label of self-hosted";
const description =
  "Bied ZekerFlex zelf aan: koppel één module via de API (plugin), draai het hele platform onder je eigen merk (white-label), of host alles op je eigen infrastructuur. AI-recruiter, matching, uren & facturen, uitzend en webshop in één.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["uitzendsoftware white-label", "recruitment platform kopen", "ats plugin", "flexpool software", "saas uitzendbureau"],
  ...canonical("/voor-bureaus", { title, description }),
};

const FAQ = [
  { q: "Kan ik losse modules afnemen?", a: "Ja. Met het Plugin-pakket koppel je één module (bv. de AI-recruiter of de matching-engine) via onze REST-API + webhooks aan je eigen systeem, zonder de rest." },
  { q: "Is het echt white-label?", a: "Ja. In het Platform-pakket draait ZekerFlex onder je eigen merk, kleuren en subdomein; je huisstijl en teksten pas je zelf aan zonder nieuwe release." },
  { q: "Kan ik het zelf hosten?", a: "Ja. Het Soeverein-pakket draait de hele stack op je eigen VPS (app, DNS, mail, Redis, taal- en beeldmodel), met eigen data en sleutels — afhankelijk van niemand." },
  { q: "Betaal ik per AI-gebruik?", a: "Nee. De AI draait op onze self-hoste modellen (taal én beeld), dus geen kosten per intake of per gegenereerd beeld — anders dan bij tools die per credit rekenen." },
  { q: "Wat kost het precies?", a: "De genoemde bedragen zijn indicatieve startprijzen; de definitieve prijs stemmen we af op je omvang en gekozen modules. Vraag een offerte aan via sales@zekerflex.com." },
  { q: "Van wie is de data?", a: "Bij het Soeverein-pakket staat alles op jouw eigen infrastructuur, dus volledig van jou. Bij Platform/Plugin blijft je data gescheiden per afnemer en AVG-conform verwerkt." },
];

export default function VoorBureausPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">Voor bureaus &amp; bedrijven</p>
          <h1 className="mt-4 font-display text-4xl font-bold md:text-6xl">Bied ZekerFlex zelf aan</h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            De complete flex-/uitzend-motor — AI-recruiter, matching, uren &amp; facturen, uitzend (ABU/StiPP) en webshop —
            als plugin op je eigen systeem, als white-label platform onder je merk, of volledig self-hosted op je eigen infra.
          </p>
          <p className="mt-4 text-sm text-white/60">
            Liever één losse module i.p.v. het hele platform?{" "}
            <Link href="/producten" className="text-brand-mint underline">Bekijk de losse producten →</Link>
          </p>
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow="Pakketten" title="Kies hoe je ZekerFlex inzet" intro="Van één gekoppelde module tot je eigen, volledig zelf-gehoste platform." />
        <PartnerPlans />
      </Section>

      <Section>
        <SectionHead
          eyebrow="Waarom ZekerFlex"
          title="Eén motor, geen vendor-afhankelijkheid"
          intro="Je krijgt een volledig uitontwikkeld platform dat je zelf in de hand houdt."
        />
        <div className="mt-8 grid gap-6 sm:grid-cols-3 text-sm text-neutralx-700">
          <div><p className="font-semibold text-ink">AI zonder credits</p><p className="mt-1">Recruiter en beeld draaien op eigen modellen — geen kosten per intake of beeld.</p></div>
          <div><p className="font-semibold text-ink">Volledige keten</p><p className="mt-1">Van vacature en matching tot uren, facturen, ABU/StiPP en betalingen.</p></div>
          <div><p className="font-semibold text-ink">Jouw data, jouw infra</p><p className="mt-1">Self-host alles met onze deploy-recepten, of laat ons het white-label draaien.</p></div>
        </div>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Veelgestelde vragen" title="Goed om te weten" />
        <div className="mt-8">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand
        title="Benieuwd wat ZekerFlex voor jouw bureau kan?"
        body="Vraag een demo of offerte aan, of bekijk de API-documentatie voor de plugin-koppeling."
        primaryHref="/developers"
        primaryLabel="Bekijk de API"
        secondaryHref="/prijzen"
        secondaryLabel="Prijzen voor eindklanten"
      />
    </>
  );
}
