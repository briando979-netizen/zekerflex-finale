import { vt } from "@/lib/i18n/site";
import { getSiteT } from "@/lib/i18n/server";
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
  "Uitzendbureau? Zet je diensten onder je eigen naam in de ZekerFlex-app. Werkers melden zich meteen aan, jij neemt ze aan op je eigen uitzendcontract.";

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
  { titel: vt("Maak een bedrijfsaccount aan"), tekst: vt("Gratis en in een paar minuten. Je vult je bedrijfsgegevens in, net als elk ander bedrijf op ZekerFlex.") },
  {
    titel: vt("Wij zetten je account op uitzendpartner"),
    tekst: vt("Mail ons je KVK-nummer, je inschrijvingen als uitlener en dat je akkoord gaat met de partnervoorwaarden. Na een korte controle staat je account op uitzendpartner."),
  },
  {
    titel: vt("Plaats je uitzendklussen"),
    tekst: vt("Je klussen staan in de app als uitzendklus, onder de naam van je bureau. Werkers zien meteen dat jij de werkgever bent."),
  },
  {
    titel: vt("Werkers melden zich aan"),
    tekst: vt("Een werker ziet je dienst in de app en meldt zich aan. Jij krijgt zijn gegevens, neemt hem aan op je eigen uitzendcontract en betaalt het loon."),
  },
];

const VERDELING = [
  { wie: "Jouw bureau", punten: [vt("Is de werkgever van de uitzendkracht"), vt("Tekent het uitzendcontract"), vt("Betaalt het loon en regelt de verloning"), vt("Volgt de cao en de regels voor uitleners")] },
  { wie: "ZekerFlex", punten: [vt("Zet je klussen in de app, onder jouw naam"), vt("Laat ze zien aan werkers die erbij passen"), vt("Controleert de identiteit van elke werker"), vt("Regelt het inchecken en de urenregistratie")] },
];

const FAQ = [
  {
    q: vt("Wie is de werkgever van de uitzendkracht?"),
    a: vt("Jouw bureau. Bij een klus van een uitzendpartner tekent de werker zijn uitzendcontract met jou en betaal jij het loon. ZekerFlex is geen werkgever en geen uitlener bij die klussen."),
  },
  {
    q: vt("Wat kost het?"),
    a: `${euro(BASE_FEE_PER_HOUR_CENTS)} per gewerkt uur, alleen als er echt gewerkt is. Geen abonnement en geen plaatsingskosten.`,
  },
  {
    q: vt("Moet mijn bureau een toelating hebben?"),
    a: vt("Je bent zelf de uitlener, dus je hebt de inschrijvingen die daarbij horen. Vanaf 2027 geldt de Wet toelating terbeschikkingstelling arbeidskrachten (Wtta). We vragen naar je inschrijving voordat je account uitzendpartner wordt."),
  },
  {
    q: vt("Welke gegevens van een werker krijg ik?"),
    a: vt("Als een werker zich voor je dienst aanmeldt, geeft hij toestemming om zijn contactgegevens met je bureau te delen. Daarmee neem je contact op over het contract en de voorwaarden."),
  },
  {
    q: vt("Welke regels gelden er, en wat als een bureau zich er niet aan houdt?"),
    a: vt("Alles staat in de partnervoorwaarden: wie partner kan worden, de regels voor klussen en voor de gegevens van werkers, de kosten, de boetes en hoe ZekerFlex handhaaft (eerst een waarschuwing, dan een schorsing, dan het einde van de samenwerking; bij ernstige overtredingen direct)."),
  },
  {
    q: vt("Kan ik ook freelance klussen plaatsen?"),
    a: vt("Een uitzendpartner plaatst uitzendklussen. Wil je ook freelance klussen plaatsen, dan kan dat met een gewoon bedrijfsaccount."),
  },
];

export default async function UitzendpartnerPage() {
  const tx = await getSiteT();
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
            eyebrow={tx("Voor uitzendbureaus")}
            title={tx("Zet je uitzendklussen op ZekerFlex")}
            intro={tx("Je diensten staan in de ZekerFlex-app onder de naam van je bureau. Werkers in de app zien jouw dienst en melden zich er meteen voor aan. Jij neemt ze aan op je eigen uitzendcontract en regelt het loon zoals je gewend bent. ZekerFlex brengt de werkers.")}
          />
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/register?type=bedrijf" className="btn-primary">
              {tx("Meld je bureau aan")}
            </Link>
            <a href="mailto:uitzendbureau@zekerflex.com?subject=Uitzendpartner%20worden" className="btn-ghost">
              {tx("Mail ons")}
            </a>
            <Link href={PARTNER_VOORWAARDEN_PAD} className="btn-ghost">
              {tx("Lees de partnervoorwaarden")}
            </Link>
          </div>
        </HeroMetFoto>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow={tx("Zo werkt het")} title={tx("In vier stappen uitzendpartner")} />
        <ol className="mt-10 grid gap-6 md:grid-cols-2">
          {STAPPEN.map((s, i) => (
            <li key={s.titel} className="flex gap-4">
              <span className="num flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 font-mono text-sm text-white">{i + 1}</span>
              <div>
                <h3 className="font-display text-lg font-semibold">{tx(s.titel)}</h3>
                <p className="mt-1 text-[0.95rem] leading-relaxed text-neutralx-600">{tx(s.tekst)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <SectionHead eyebrow={tx("Wie doet wat")} title={tx("Jij de werkgever, wij de app")} />
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
        <SectionHead eyebrow={tx("Veelgestelde vragen")} title={tx("Uitzendpartner worden")} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={FAQ.map((f) => ({ q: tx(f.q), a: tx(f.a) }))} />
        </div>
        <p className="mt-8 text-sm text-neutralx-500">
          {tx("De regels, de boetes en het beleid staan in de")}{" "}
          <Link href={PARTNER_VOORWAARDEN_PAD} className="text-brand-600 underline">
            {tx("partnervoorwaarden voor uitzendbureaus")}
          </Link>
          . Vragen? Mail{" "}
          <a href="mailto:uitzendbureau@zekerflex.com" className="text-brand-600 underline">
            {tx("uitzendbureau@zekerflex.com")}
          </a>
          .
        </p>
      </Section>

      <CtaBand
        title={tx("Zet je eerste uitzendklus op ZekerFlex")}
        body={tx("Maak een bedrijfsaccount aan en mail ons je KVK-nummer. Wij zetten je account op uitzendpartner.")}
        primaryHref="/register?type=bedrijf"
        primaryLabel={tx("Meld je bureau aan")}
        secondaryHref="/starten-als-uitzendkracht"
        secondaryLabel={tx("Werken als uitzendkracht")}
      />
    </>
  );
}
