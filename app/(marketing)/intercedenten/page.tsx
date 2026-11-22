import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { HeroMetFoto } from "@/components/marketing/HeroMetFoto";
import { paginaFoto } from "@/lib/marketing/fotos";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

const title = "ZekerFlex voor intercedenten: minder administratie";
const description =
  "Wat ZekerFlex een intercedent uit handen neemt: passende krachten voorstellen, certificaten controleren, uitval opvangen en uren goedkeuren.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["intercedent", "intercedent software", "uitzendbureau software", "werk van een intercedent", "uitzendkrachten plannen"],
  ...canonical("/intercedenten", { title, description }),
};

// /intercedenten (16 nov 2026): voor wie het werk van een intercedent doet (uitzend- of detacheringsbureau, of een bedrijf met
// een eigen flexpool). Per taak staat er wat ZekerFlex overneemt, met een verwijzing naar de pagina waar dat staat. Alleen wat er
// echt is (lib/marketing/aanbod.ts); geen cijfers over klanten of tijdwinst, en wat een mens blijft doen staat er eerlijk bij.

const TAKEN: { taak: string; zekerflex: string; href: string; label: string }[] = [
  {
    taak: "Passende kandidaten zoeken",
    zekerflex: "Je plaatst een dienst; hij komt bij geverifieerde flexwerkers in de buurt en jij kiest wie je inroostert. Krachten die goed bevallen zet je bij je favorieten of in een vaste pool.",
    href: "/bedrijven",
    label: "Flexwerkers inhuren",
  },
  {
    taak: "Certificaten controleren",
    zekerflex: "Een foto van een VCA- of BHV-diploma is genoeg: de gegevens staan ingevuld, gelezen op onze eigen server. Je hoeft geen kopieën na te lopen.",
    href: "/aanbod/certificaten-in-een-foto",
    label: "Certificaten in één foto",
  },
  {
    taak: "Een uitvaller opvangen",
    zekerflex: "Vandaag nog iemand nodig? Eén oproep gaat naar krachten in de buurt. Wie 1 antwoordt, staat ingepland.",
    href: "/aanbod/spoedoproep",
    label: "Spoedoproep",
  },
  {
    taak: "De week inplannen",
    zekerflex: "Een week vol diensten in één keer ingepland: alle plekken gevuld tegen de laagste kosten. Jij kiest wat je verstuurt.",
    href: "/aanbod/roosterplanner",
    label: "Automatische roosterplanner",
  },
  {
    taak: "Aanwezigheid en uren bijhouden",
    zekerflex: "De kracht checkt in op de locatie. De uren staan daarna klaar om goed te keuren, met het bewijs erbij.",
    href: "/aanbod/automatisch-inchecken",
    label: "Automatisch in- en uitchecken",
  },
  {
    taak: "Loon en facturen regelen",
    zekerflex: "Bij een uitzendkracht blijft het uitzendbureau de werkgever en regelt het loon, cao en pensioen zelf, met de goedgekeurde uren uit de app. Bij een zelfstandige komt de factuur vanzelf uit de goedgekeurde uren.",
    href: "/uitzendpartner",
    label: "Uitzendklussen op ZekerFlex",
  },
];

const BLIJFT = [
  "Kennismaken met een kandidaat en inschatten of die bij de klant past.",
  "De relatie met de klant: begrijpen wat er echt nodig is en dat terugkoppelen.",
  "Het gesprek als iets misgaat, en de beslissing wie je inzet.",
];

const FAQ = [
  {
    q: "Vervangt ZekerFlex de intercedent?",
    a: "Nee. ZekerFlex neemt het herhalende en administratieve werk over: voorstellen, controleren, inplannen, uren en facturen. Het gesprek met de kandidaat en de relatie met de klant blijven mensenwerk.",
  },
  {
    q: "Kan ik mijn eigen mensen blijven gebruiken?",
    a: "Ja. Krachten die goed bevallen zet je bij je favorieten of in een vaste pool en je roostert ze met één tik opnieuw in.",
  },
  {
    q: "Wat kost het?",
    a: "Je betaalt het uurtarief van de kracht plus € 3,50 platformkosten per gewerkt uur, en alleen als er echt gewerkt is. Geen abonnement voor personeel. Wil je ZekerFlex onder je eigen naam aanbieden, kijk dan bij Voor bureaus.",
  },
  {
    q: "Voor wie is dit bedoeld?",
    a: "Voor uitzend- en detacheringsbureaus en voor bedrijven met een eigen flexpool, die het werk van een intercedent in een kleiner team of met minder handwerk willen doen.",
  },
];

export default function IntercedentenPage() {
  const vragen = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson([breadcrumbJsonLd([["Home", "/"], ["Voor intercedenten", "/intercedenten"]]), vragen]) }}
      />
      <Section>
        <HeroMetFoto foto={paginaFoto("intercedenten")}>
          <SectionHead
            kop="h1"
            eyebrow="Voor intercedenten"
            title="Minder administratie, meer tijd voor mensen"
            intro="Een intercedent zoekt, selecteert, plant, volgt uren en regelt de papieren. ZekerFlex neemt het herhalende deel over, zodat je tijd overhoudt voor kandidaten en klanten."
          />
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/demo" className="btn-primary">
              Plan een demo
            </Link>
            <Link href="/voor-bureaus" className="btn-ghost">
              Voor bureaus
            </Link>
          </div>
        </HeroMetFoto>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Een werkdag" title="Wat een intercedent doet, en wat ZekerFlex overneemt" />
        <ul className="mt-10 grid gap-5 md:grid-cols-2">
          {TAKEN.map((t) => (
            <li key={t.taak} className="rounded-2xl border border-hair bg-white p-6">
              <h3 className="font-display text-xl font-bold text-ink">{t.taak}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{t.zekerflex}</p>
              <Link href={t.href} className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline">
                {t.label} →
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <SectionHead eyebrow="Eerlijk" title="Wat een mens blijft doen" intro="ZekerFlex doet niet alsof het alles kan. Dit blijft het werk van een intercedent:" />
        <ul className="mt-8 max-w-2xl space-y-3">
          {BLIJFT.map((b) => (
            <li key={b} className="flex gap-3 text-neutralx-700">
              <span aria-hidden className="mt-0.5 font-bold text-brand-600">
                ✓
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Veelgestelde vragen" title="Intercedenten en ZekerFlex" />
        <div className="mt-8 max-w-3xl">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <CtaBand
        title="Zie hoe het in jouw werk past"
        body="Plan een demo van 30 minuten, of kijk hoe je ZekerFlex onder je eigen naam aanbiedt."
        primaryHref="/demo"
        primaryLabel="Plan een demo"
        secondaryHref="/voor-bureaus"
        secondaryLabel="Voor bureaus"
      />
    </>
  );
}
