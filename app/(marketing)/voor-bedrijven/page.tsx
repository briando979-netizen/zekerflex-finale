import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { HeroChecks } from "@/components/marketing/HeroChecks";
import { Photo } from "@/components/marketing/Photo";
import { SceneApprove } from "@/components/marketing/Scene";
import { canonical } from "@/lib/seo";
import { contentKeys, getContentMap } from "@/lib/content/store";

export const metadata: Metadata = {
  title: "Flexkrachten & zzp'ers inhuren",
  description:
    "Huur betrouwbare zzp'ers en flexkrachten in, precies wanneer je ze nodig hebt — horeca, retail, logistiek en meer. Automatische matching per vestiging, GPS check-in en Wet DBA-bewaking ingebouwd. € 3,50 per gewerkt uur, geen abonnement.",
  keywords: [
    "zzp'er inhuren",
    "flexkrachten inhuren",
    "personeel inhuren horeca",
    "personeel inhuren retail",
    "tijdelijk personeel vinden",
    "uitzendkrachten inhuren",
    "flexpool opzetten",
  ],
  ...canonical("/voor-bedrijven"),
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

const TOOLS = [
  {
    href: "/rekentools/kosten-uitzendkracht-berekenen",
    title: "Wat kost een flexkracht?",
    body: "Zet een uitzendbureau naast een zzp'er via ZekerFlex, met jouw uurloon, omrekenfactor en uren.",
  },
  {
    href: "/rekentools/wet-dba-check",
    title: "Wet DBA-check",
    body: "Tien vragen over hoe je met een zzp'er samenwerkt. Zie direct waar het op loondienst lijkt.",
  },
];

const FAQ = [
  { q: "Wat kost het?", a: "€ 3,50 platformkosten per gewerkt uur. Je betaalt alleen wanneer er daadwerkelijk iemand werkt. Geen abonnement, geen opstart- of plaatsingskosten." },
  { q: "Hoe snel kan ik iemand hebben?", a: "Bij bekende functies met automatische toewijzing gaat het aanbod in golven naar passende krachten. Je ziet reacties live binnenkomen; de invulling hangt af van wie beschikbaar is." },
  { q: "Hoe ondersteunt ZekerFlex bij de Wet DBA?", a: "ZekerFlex legt afspraken vast, signaleert onder meer urenconcentratie en kan matching bij verhoogde risico's beperken. Dit geeft geen garantie over de arbeidsrelatie: de beoordeling hangt ook af van hoe er in de praktijk wordt gewerkt." },
  { q: "Kan ik meerdere vestigingen beheren?", a: "Ja. Je richt een organisatie in met vestigingen, wijst lokale managers toe met of zonder locatiebeperking, en houdt op hoofdkantoorniveau overzicht over alles." },
];

export default async function VoorBedrijvenPage() {
  // teksten uit de Site-ontwerper (Teksten); zonder eigen versie exact de standaard
  const tekst = await getContentMap(contentKeys("vb."));
  const v = (k: string) => tekst[k] ?? "";
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell grid gap-12 py-20 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-28">
          <div>
            <p className="eyebrow text-brand-mint" data-cms-key="vb.eyebrow">{v("vb.eyebrow")}</p>
            <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl" data-cms-key="vb.title">
              {v("vb.title")}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/70" data-cms-key="vb.lead" data-cms-ml="1">
              {v("vb.lead")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register?type=bedrijf" className="btn-mint" data-cms-key="vb.cta1">
                {v("vb.cta1")}
              </Link>
              <Link href="/prijzen" className="btn-ghost-invert" data-cms-key="vb.cta2">
                {v("vb.cta2")}
              </Link>
            </div>
            <p className="mt-4 text-sm text-white/70">
              Eerst kijken?{" "}
              <Link href="/klus-plaatsen" className="font-semibold text-brand-mint underline">
                Stel je klus samen zonder account
              </Link>
            </p>
            <HeroChecks items={["Diensten plaatsen wanneer het jou uitkomt", "Inzicht en controle per dienst", "Snel, makkelijk, flexibel"]} />
          </div>
          <Photo name="employerHero" fallback={<SceneApprove />} className="mx-auto w-full max-w-sm shadow-lift" />
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow={v("vb.sys.eyebrow")} title={v("vb.sys.title")} cms={{ eyebrow: "vb.sys.eyebrow", title: "vb.sys.title" }} />
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
            <div className="num font-display text-2xl font-bold text-brand-mint">Afspraken</div>
            <p className="mt-1 text-sm text-white/60">vastgelegd per samenwerking</p>
          </div>
        </div>
      </div>

      <Section tone="paper">
        <SectionHead
          eyebrow={v("vb.tools.eyebrow")}
          title={v("vb.tools.title")}
          intro={v("vb.tools.intro")}
          cms={{ eyebrow: "vb.tools.eyebrow", title: "vb.tools.title", intro: "vb.tools.intro" }}
        />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="card group flex flex-col p-7 transition-shadow hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <span className="font-display text-xl font-semibold text-ink">{t.title}</span>
              <span className="mt-2 flex-1 text-[0.975rem] leading-relaxed text-neutralx-600">{t.body}</span>
              <span className="mt-5 text-sm font-semibold text-brand-600 group-hover:underline">Naar de rekentool →</span>
            </Link>
          ))}
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow={v("vb.faq.eyebrow")} title={v("vb.faq.title")} cms={{ eyebrow: "vb.faq.eyebrow", title: "vb.faq.title" }} />
        <div className="mt-10">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand
        title={v("vb.cta.title")}
        body={v("vb.cta.body")}
        primaryHref="/register?type=bedrijf"
        primaryLabel={v("vb.cta.primary")}
        secondaryLabel={v("vb.cta.secondary")}
        secondaryHref="/voor-freelancers"
        cms={{ title: "vb.cta.title", body: "vb.cta.body", primary: "vb.cta.primary", secondary: "vb.cta.secondary" }}
      />
    </>
  );
}
