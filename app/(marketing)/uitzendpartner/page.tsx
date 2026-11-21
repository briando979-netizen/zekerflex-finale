import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { HeroMetFoto } from "@/components/marketing/HeroMetFoto";
import { paginaFoto } from "@/lib/marketing/fotos";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { BASE_FEE_PER_HOUR_CENTS } from "@/lib/pricing/tiers";
import { PARTNER_VOORWAARDEN_PAD } from "@/lib/uitzend/voorwaarden";

const title = "Voor uitzendbureaus: zet je uitzendklussen op ZekerFlex";
const description =
  "Uitzendbureau? Zet je uitzendklussen in de ZekerFlex-app onder je eigen naam. Werkers vragen met één knop een uitzendcontract bij je aan. Jij blijft de werkgever, ZekerFlex rekent een vaste vergoeding per gewerkt uur.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["uitzendbureau", "uitzendpartner", "uitzendkrachten vinden", "uitzendklussen plaatsen", "flexwerkers voor uitzendbureaus"],
  ...canonical("/uitzendpartner", { title, description }),
};

// /uitzendpartner (21 nov 2026, eigenaar: "alle uitzendbureaus de optie geven zoals YoungOnes dat met YoungCapital doet").
// Een uitzendbureau zet zijn klussen op ZekerFlex en blijft zelf de werkgever (lib/uitzend/partners-kern.ts). Alleen wat er
// echt is: het beheer zet een bureau op uitzendpartner na een controle; geen cijfers over bureaus of plaatsingen.

const euro = (cent: number) => `€ ${(cent / 100).toFixed(2).replace(".", ",")}`;

const STAPPEN = [
  { titel: "Maak een bedrijfsaccount aan", tekst: "Gratis en in een paar minuten. Je vult je bedrijfsgegevens in, net als elk ander bedrijf op ZekerFlex." },
  {
    titel: "Wij zetten je account op uitzendpartner",
    tekst: "Mail ons je KVK-nummer, je inschrijvingen als uitlener en dat je akkoord gaat met de partnervoorwaarden. Na een korte controle staat je account op uitzendpartner.",
  },
  {
    titel: "Plaats je uitzendklussen",
    tekst: "Je klussen staan in de app als uitzendklus, onder de naam van je bureau. Werkers zien meteen dat jij de werkgever bent.",
  },
  {
    titel: "Werkers vragen een uitzendcontract aan",
    tekst: "Met één knop vraagt een werker een uitzendcontract bij je aan. Jij krijgt zijn gegevens, regelt het contract en betaalt het loon.",
  },
];

const VERDELING = [
  { wie: "Jouw bureau", punten: ["Is de werkgever van de uitzendkracht", "Tekent het uitzendcontract", "Betaalt het loon en regelt de verloning", "Volgt de cao en de regels voor uitleners"] },
  { wie: "ZekerFlex", punten: ["Zet je klussen in de app, onder jouw naam", "Laat ze zien aan werkers die erbij passen", "Controleert de identiteit van elke werker", "Regelt het inchecken en de urenregistratie"] },
];

const FAQ = [
  {
    q: "Wie is de werkgever van de uitzendkracht?",
    a: "Jouw bureau. Bij een klus van een uitzendpartner tekent de werker zijn uitzendcontract met jou en betaal jij het loon. ZekerFlex is geen werkgever en geen uitlener bij die klussen.",
  },
  {
    q: "Wat kost het?",
    a: `${euro(BASE_FEE_PER_HOUR_CENTS)} per gewerkt uur, alleen als er echt gewerkt is. Geen abonnement en geen plaatsingskosten.`,
  },
  {
    q: "Moet mijn bureau een toelating hebben?",
    a: "Je bent zelf de uitlener, dus je hebt de inschrijvingen die daarbij horen. Vanaf 2027 geldt de Wet toelating terbeschikkingstelling arbeidskrachten (Wtta). We vragen naar je inschrijving voordat je account uitzendpartner wordt.",
  },
  {
    q: "Welke gegevens van een werker krijg ik?",
    a: "Als een werker op je klus een uitzendcontract aanvraagt, geeft hij toestemming om zijn contactgegevens met je bureau te delen. Daarmee neem je contact op over het contract en de voorwaarden.",
  },
  {
    q: "Welke regels gelden er, en wat als een bureau zich er niet aan houdt?",
    a: "Alles staat in de partnervoorwaarden: wie partner kan worden, de regels voor klussen en voor de gegevens van werkers, de kosten, de boetes en hoe ZekerFlex handhaaft (eerst een waarschuwing, dan een schorsing, dan het einde van de samenwerking; bij ernstige overtredingen direct).",
  },
  {
    q: "Kan ik ook freelance klussen plaatsen?",
    a: "Een uitzendpartner plaatst uitzendklussen. Wil je ook freelance klussen plaatsen, dan kan dat met een gewoon bedrijfsaccount.",
  },
];

export default function UitzendpartnerPage() {
  const vragen = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson([breadcrumbJsonLd([["Home", "/"], ["Voor uitzendbureaus", "/uitzendpartner"]]), vragen]) }}
      />
      <Section>
        <HeroMetFoto foto={paginaFoto("uitzendpartner")}>
          <SectionHead
            kop="h1"
            eyebrow="Voor uitzendbureaus"
            title="Zet je uitzendklussen op ZekerFlex"
            intro="Je klussen staan in de ZekerFlex-app onder de naam van je bureau. Werkers vragen met één knop een uitzendcontract bij je aan. Jij blijft de werkgever; ZekerFlex brengt de werkers."
          />
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/register?type=bedrijf" className="btn-primary">
              Meld je bureau aan
            </Link>
            <a href="mailto:uitzendbureau@zekerflex.com?subject=Uitzendpartner%20worden" className="btn-ghost">
              Mail ons
            </a>
            <Link href={PARTNER_VOORWAARDEN_PAD} className="btn-ghost">
              Lees de partnervoorwaarden
            </Link>
          </div>
        </HeroMetFoto>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Zo werkt het" title="In vier stappen uitzendpartner" />
        <ol className="mt-10 grid gap-6 md:grid-cols-2">
          {STAPPEN.map((s, i) => (
            <li key={s.titel} className="flex gap-4">
              <span className="num flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 font-mono text-sm text-white">{i + 1}</span>
              <div>
                <h3 className="font-display text-lg font-semibold">{s.titel}</h3>
                <p className="mt-1 text-[0.95rem] leading-relaxed text-neutralx-600">{s.tekst}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <SectionHead eyebrow="Wie doet wat" title="Jij de werkgever, wij de app" />
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {VERDELING.map((v) => (
            <div key={v.wie} className="rounded-2xl border border-hair bg-white p-6">
              <h3 className="font-display text-xl font-bold text-ink">{v.wie}</h3>
              <ul className="mt-4 space-y-2">
                {v.punten.map((p) => (
                  <li key={p} className="flex gap-3 text-sm text-neutralx-700">
                    <span aria-hidden className="font-bold text-brand-600">
                      ✓
                    </span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Uitzendpartner worden" />
        <div className="mt-8 max-w-3xl">
          <FaqList items={FAQ} />
        </div>
        <p className="mt-8 text-sm text-neutralx-500">
          De regels, de boetes en het beleid staan in de{" "}
          <Link href={PARTNER_VOORWAARDEN_PAD} className="text-brand-600 underline">
            partnervoorwaarden voor uitzendbureaus
          </Link>
          . Vragen? Mail{" "}
          <a href="mailto:uitzendbureau@zekerflex.com" className="text-brand-600 underline">
            uitzendbureau@zekerflex.com
          </a>
          .
        </p>
      </Section>

      <CtaBand
        title="Zet je eerste uitzendklus op ZekerFlex"
        body="Maak een bedrijfsaccount aan en mail ons je KVK-nummer. Wij zetten je account op uitzendpartner."
        primaryHref="/register?type=bedrijf"
        primaryLabel="Meld je bureau aan"
        secondaryHref="/uitzendbureau"
        secondaryLabel="Werken als uitzendkracht"
      />
    </>
  );
}
