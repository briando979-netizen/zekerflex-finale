import type { Metadata } from "next";
import { Section, SectionHead, CtaBand } from "@/components/marketing/primitives";
import { Photo } from "@/components/marketing/Photo";
import { SceneTeam } from "@/components/marketing/Scene";
import { OpenApplicationForm } from "@/components/marketing/OpenApplicationForm";
import { canonical } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Over ZekerFlex",
  description:
    "Een platform voor flexibel werk in Nederland. Dit is wie we zijn en waarom we ZekerFlex bouwen.",
  ...canonical("/over-ons"),
};

export default function OverOnsPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">Over ons</p>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
            Flexibel werk hoort eerlijk, snel en zeker te zijn.
          </h1>
          <div className="mt-10">
            <Photo name="team" fallback={<SceneTeam />} className="shadow-lift" />
          </div>
        </div>
      </div>

      <Section tone="paper">
        <div id="verhaal" className="scroll-mt-24" />
        <div className="max-w-2xl space-y-5 text-[1.05rem] leading-relaxed text-ink-soft">
          <p>
            ZekerFlex is ontstaan uit een simpele frustratie: flexibel werken in
            Nederland is omslachtig geworden. Zzp&apos;ers wachten weken op hun
            geld en verdrinken in facturen. Werkgevers puzzelen met bezetting en
            lopen risico op de Wet DBA. En tussen beide partijen staat een
            groeiend aantal bemiddelaars die vooral zichzelf bedienen.
          </p>
          <p>
            Wij bouwen het alternatief: één systeem dat de match maakt, de
            overeenkomst regelt, de uren verwerkt, de facturen opstelt en de
            uitbetaling laat kiezen — met compliance ingebouwd in plaats van erbij bedacht.
          </p>
          <p>
            We bouwen ZekerFlex voor de Nederlandse arbeidsmarkt. Voor hosting,
            betalingen, e-mail en identiteitscontroles werken we met gespecialiseerde
            dienstverleners. Onze AI-assistent kan draaien op een eigen modelserver.
            We leggen in ons privacybeleid uit welke gegevens we gebruiken en met wie we die delen.
          </p>
        </div>
      </Section>

      <Section tone="soft">
        <div id="uitgangspunten" className="scroll-mt-24" />
        <SectionHead eyebrow="Waar we voor staan" title="Drie uitgangspunten" />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { t: "Onafhankelijk", b: "Geen tussenpartijen die aan beide kanten verdienen. Eén transparante fee, verder niets." },
            { t: "Zeker", b: "Compliance, verificatie en een auditspoor zijn geen extra's — ze zitten in de kern van het product." },
            { t: "Transparant", b: "We leggen uit welke gegevens we verwerken en welke dienstverleners daarbij betrokken zijn." },
          ].map((v) => (
            <div key={v.t} className="card p-6">
              <h3 className="font-display text-lg font-semibold">{v.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{v.b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="paper">
        <div id="werken-bij" className="scroll-mt-24" />
        <SectionHead
          eyebrow="Werken bij ons"
          title="Bouw mee aan ZekerFlex"
          intro="We hebben niet altijd een vacature openstaan, maar goede mensen zijn altijd welkom. Stuur een open sollicitatie — vertel wat je meebrengt en waar je energie van krijgt."
        />
        <div className="mt-10 max-w-2xl">
          <OpenApplicationForm />
        </div>
      </Section>

      <CtaBand title="Doe mee" body="Als freelancer of als werkgever — aanmelden is gratis." />
    </>
  );
}
