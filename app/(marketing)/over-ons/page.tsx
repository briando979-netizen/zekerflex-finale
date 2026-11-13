import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import { Section, SectionHead, CtaBand } from "@/components/marketing/primitives";
import { Photo } from "@/components/marketing/Photo";
import { SceneTeam } from "@/components/marketing/Scene";
import { OpenApplicationForm } from "@/components/marketing/OpenApplicationForm";
import { seoMetadata } from "@/lib/ontwerp/seo-store";
import { contentKeys, getContentMap } from "@/lib/content/store";
import { zichtbareSecties } from "@/lib/ontwerp/vaste-paginas";
import { getPaginaIndeling } from "@/lib/ontwerp/vaste-paginas-store";

// titel en omschrijving: de standaard in lib/ontwerp/seo.ts, of een eigen versie uit de Site-ontwerper (SEO)
export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/over-ons", { authors: [{ name: "Briando van Essen" }], creator: "Briando van Essen" });
}

export default async function OverOnsPage() {
  // teksten uit de Site-ontwerper (Teksten); zonder eigen versie exact de standaard
  const tekst = await getContentMap(contentKeys("oo."));
  const v = (k: string) => tekst[k] ?? "";
  // de onderdelen onder de kop: volgorde en zichtbaarheid uit de Site-ontwerper (Pagina's); zonder eigen indeling exact de standaard
  const onderdelen: Record<string, ReactNode> = {
    verhaal: (
      <Section tone="paper">
        <div id="verhaal" className="scroll-mt-24" />
        <div className="max-w-2xl space-y-5 text-[1.05rem] leading-relaxed text-ink-soft">
          <p data-cms-key="oo.verhaal1" data-cms-ml="1">{v("oo.verhaal1")}</p>
          <p data-cms-key="oo.verhaal2" data-cms-ml="1">{v("oo.verhaal2")}</p>
          <p data-cms-key="oo.verhaal3" data-cms-ml="1">{v("oo.verhaal3")}</p>
        </div>
      </Section>
    ),
    oprichter: (
      <Section tone="paper">
        <div id="oprichter" className="scroll-mt-24" />
        <SectionHead eyebrow={v("oo.opr.eyebrow")} title={v("oo.opr.title")} cms={{ eyebrow: "oo.opr.eyebrow", title: "oo.opr.title" }} />
        <div className="mt-8 max-w-2xl space-y-5 text-[1.05rem] leading-relaxed text-ink-soft">
          <p>
            ZekerFlex is opgebouwd, bedacht en zelf geschreven door{" "}
            <strong className="text-ink">Briando van Essen</strong> — van het eerste idee tot de code die je nu
            gebruikt. Geen team van investeerders, geen overgenomen platform: één persoon die het hele systeem van de
            grond af heeft neergezet, omdat het eerlijker en simpeler kon.
          </p>
          <p data-cms-key="oo.opr.tekst" data-cms-ml="1">{v("oo.opr.tekst")}</p>
        </div>
      </Section>
    ),
    uitgangspunten: (
      <Section tone="soft">
        <div id="uitgangspunten" className="scroll-mt-24" />
        <SectionHead eyebrow={v("oo.punten.eyebrow")} title={v("oo.punten.title")} cms={{ eyebrow: "oo.punten.eyebrow", title: "oo.punten.title" }} />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { t: "Onafhankelijk", b: "Geen tussenpartijen die aan beide kanten verdienen. Eén transparante fee, verder niets." },
            { t: "Zeker", b: "Compliance, verificatie en een auditspoor zijn geen extra's — ze zitten in de kern van het product." },
            { t: "Transparant", b: "We leggen uit welke gegevens we verwerken en welke dienstverleners daarbij betrokken zijn." },
          ].map((p) => (
            <div key={p.t} className="card p-6">
              <h3 className="font-display text-lg font-semibold">{p.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{p.b}</p>
            </div>
          ))}
        </div>
      </Section>
    ),
    werkenbij: (
      <Section tone="paper">
        <div id="werken-bij" className="scroll-mt-24" />
        <SectionHead
          eyebrow={v("oo.werk.eyebrow")}
          title={v("oo.werk.title")}
          intro={v("oo.werk.intro")}
          cms={{ eyebrow: "oo.werk.eyebrow", title: "oo.werk.title", intro: "oo.werk.intro" }}
        />
        <div className="mt-10 max-w-2xl">
          <OpenApplicationForm />
        </div>
      </Section>
    ),
    slot: (
      <CtaBand
        title={v("oo.cta.title")}
        body={v("oo.cta.body")}
        primaryLabel={v("oo.cta.primary")}
        secondaryLabel={v("oo.cta.secondary")}
        cms={{ title: "oo.cta.title", body: "oo.cta.body", primary: "oo.cta.primary", secondary: "oo.cta.secondary" }}
      />
    ),
  };
  const zichtbaar = zichtbareSecties("over-ons", await getPaginaIndeling("over-ons"));
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint" data-cms-key="oo.eyebrow">{v("oo.eyebrow")}</p>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl" data-cms-key="oo.title">
            {v("oo.title")}
          </h1>
          <div className="mt-10">
            <Photo name="team" fallback={<SceneTeam />} className="shadow-lift" />
          </div>
        </div>
      </div>

      {zichtbaar.map((id) => (
        <Fragment key={id}>{onderdelen[id]}</Fragment>
      ))}
    </>
  );
}
