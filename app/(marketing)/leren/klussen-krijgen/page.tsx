import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, FaqList, Section, SectionHead, Stat } from "@/components/marketing/primitives";
import { FotoKolom } from "@/components/marketing/HeroMetFoto";
import { StapNummer } from "@/components/marketing/Verkopen";
import { paginaFoto } from "@/lib/marketing/fotos";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { AANBOD, FOUTEN, LEREN_AANMELD_PAD, LEREN_CONTACT_PAD, LEREN_OPEN_KLUSSEN_PAD, LEREN_PAD, PRIJZEN_GOEDGEKEURD, STAPPEN, VRAGEN, prijsTekst } from "@/lib/leren/klussen-krijgen";

const title = "Klussen krijgen via een platform: zeven stappen";
const description =
  "Geen reacties op je aanmeldingen? In zeven stappen aan klussen via een app of platform: een sterk profiel, je ID-check, beschikbaarheid en snel reageren.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["klussen krijgen", "werk via app", "flexwerk platform tips", "eerste klus", "geen reacties platform", "zzp klussen vinden", "uitzendwerk via app"],
  ...canonical(LEREN_PAD, { title, description }),
};

// /leren/klussen-krijgen (18 nov 2026): de gids "mensen leren hoe ze klussen op een platform krijgen", idee van de eigenaar.
// Inhoud en prijzen in lib/leren/klussen-krijgen.ts. Servercomponent, geen scripts. Alleen wat nu echt kan: de gids en de
// profielcheck zijn er; een workshop of training plannen we op aanvraag, zonder datum.

export default function KlussenKrijgenPage() {
  const kruimels = breadcrumbJsonLd([
    ["Home", "/"],
    ["Leren: klussen krijgen", LEREN_PAD],
  ]);
  const vragen = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: VRAGEN.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(kruimels) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(vragen) }} />

      <div className="hero-ink text-white">
        <div className="shell grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="eyebrow text-brand-mint">Gratis gids</p>
            <h1 className="mt-4 text-balance font-display text-4xl font-bold leading-tight md:text-6xl">Zo krijg je klussen via een platform</h1>
            <p className="mt-6 max-w-2xl text-lg text-white/70">
              Je hebt een account, je reageert, en er komt niets. Dat ligt bijna nooit aan jou als werker, maar aan een paar dingen in je profiel en je manier van reageren. Hier staan de zeven stappen die het verschil maken, bij ZekerFlex en bij elk ander platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#stappen" className="btn-mint">
                Lees de zeven stappen
              </a>
              <Link href={LEREN_AANMELD_PAD} className="btn-ghost-invert">
                Account aanmaken
              </Link>
            </div>
          </div>
          <FotoKolom foto={paginaFoto("leren")} />
        </div>
      </div>

      <Section tone="paper">
        <div className="grid gap-6 sm:grid-cols-3">
          <Stat value="7 stappen" label="Van een leeg profiel naar je eerste goede beoordeling." />
          <Stat value="30 minuten" label="Zoveel tijd kost je profiel plus de identiteitscontrole." />
          <Stat value="1 uur" label="Binnen die tijd zijn de meeste klussen vergeven: snel reageren telt." />
        </div>
      </Section>

      <Section tone="soft" id="stappen">
        <SectionHead eyebrow="De gids" title="Zeven stappen die werken" intro="In deze volgorde. Elke stap eindigt met één ding dat je vandaag kunt doen." />
        <ol className="mt-8 space-y-4">
          {STAPPEN.map((s, i) => (
            <li key={s.kop} className="flex gap-4 rounded-2xl border border-hair bg-white p-6">
              <StapNummer n={i + 1} />
              <div>
                <h3 className="font-display text-lg font-bold text-ink">{s.kop}</h3>
                <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">{s.tekst}</p>
                <p className="mt-3 rounded-lg bg-paper-soft px-3 py-2 text-sm text-ink">
                  <span className="font-semibold">Doe vandaag:</span> {s.doe}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="paper" id="fouten">
        <SectionHead eyebrow="Wat misgaat" title="De vijf fouten die we het vaakst zien" />
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FOUTEN.map((f) => (
            <li key={f.kop} className="rounded-2xl border border-hair bg-white p-5">
              <p className="font-display text-base font-bold text-ink">{f.kop}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{f.tekst}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="soft" id="aanbod">
        <SectionHead
          eyebrow="Hulp erbij"
          title="Gratis waar het kan, op aanvraag waar het meer is"
          intro={PRIJZEN_GOEDGEKEURD ? "De gids en de profielcheck kosten niets. Een workshop, begeleiding of training plannen we zodra er een groep is; de prijzen zijn richtprijzen inclusief btw." : "De gids en de profielcheck kosten niets. Een workshop, begeleiding of training plannen we zodra er een groep is; je krijgt vooraf een prijs per persoon of per groep."}
        />
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-hair text-xs font-semibold uppercase tracking-wide text-neutralx-500">
                <th className="py-3 pr-4">Wat</th>
                <th className="py-3 pr-4">Voor wie</th>
                <th className="py-3 pr-4">Wat je krijgt</th>
                <th className="py-3 pr-4">Prijs</th>
                <th className="py-3">Hoe</th>
              </tr>
            </thead>
            <tbody>
              {AANBOD.map((a) => (
                <tr key={a.naam} className="border-b border-hair align-top">
                  <td className="py-4 pr-4 font-semibold text-ink">{a.naam}</td>
                  <td className="py-4 pr-4 text-neutralx-600">{a.voorWie}</td>
                  <td className="py-4 pr-4 text-neutralx-600">{a.wat}</td>
                  <td className="py-4 pr-4 whitespace-nowrap font-semibold text-ink">
                    {prijsTekst(a).bedrag}
                    {prijsTekst(a).toelichting && <span className="block text-xs font-normal text-neutralx-500">{prijsTekst(a).toelichting}</span>}
                  </td>
                  <td className="py-4 text-neutralx-600">{a.hoe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={LEREN_CONTACT_PAD} className="btn-primary">
            Profielcheck of workshop aanvragen
          </Link>
          <Link href={LEREN_OPEN_KLUSSEN_PAD} className="btn-ghost">
            Bekijk open klussen
          </Link>
        </div>
      </Section>

      <Section tone="paper" id="vragen">
        <SectionHead eyebrow="Vragen" title="Wat mensen ons vragen" />
        <div className="mt-8">
          <FaqList items={[...VRAGEN]} />
        </div>
      </Section>

      <CtaBand
        title="Begin vandaag met stap 1"
        body="Een account is gratis. Maak je profiel af, rond je identiteitscontrole af en zet meldingen aan; daarna komen de klussen naar jou."
        primaryHref={LEREN_AANMELD_PAD}
        primaryLabel="Account aanmaken"
        secondaryHref={LEREN_OPEN_KLUSSEN_PAD}
        secondaryLabel="Open klussen bekijken"
      />
    </>
  );
}
