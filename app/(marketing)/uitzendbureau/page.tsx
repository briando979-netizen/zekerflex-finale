import type { Metadata } from "next";
import Link from "next/link";
import { canonical } from "@/lib/seo";
import { Fragment, type ReactNode } from "react";
import { zichtbareSecties } from "@/lib/ontwerp/vaste-paginas";
import { getPaginaIndeling } from "@/lib/ontwerp/vaste-paginas-store";
import { ldJson } from "@/lib/seo/json-ld";
import { prisma } from "@/lib/prisma";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { UitzendJobBoard } from "@/components/marketing/UitzendJobBoard";
import { UitzendbureauContactForm } from "@/components/marketing/UitzendbureauContactForm";
import { PaginaVideoBlok } from "@/components/marketing/PaginaVideoBlok";

export const revalidate = 3600;

// 21 nov 2026 (eigenaar): ZekerFlex is zelf geen uitzendbureau meer. Uitzendklussen komen van aangesloten uitzendbureaus
// (uitzendpartners, lib/uitzend/partners-kern.ts); dat bureau is de werkgever en regelt contract, loon, vakantiegeld en
// pensioen volgens zijn cao. Deze pagina belooft dus niets wat alleen klopte toen ZekerFlex zelf verloonde.
export const metadata: Metadata = {
  title: "Uitzendbureau — uitzendwerk zonder KVK",
  description:
    "Werk als uitzendkracht via een aangesloten uitzendbureau, ook zonder KVK. Kies zelf je klussen; het uitzendbureau is je werkgever en regelt je contract, loon, vakantiegeld en pensioen volgens zijn cao.",
  keywords: [
    "uitzendbureau",
    "uitzendwerk zonder KVK",
    "uitzendkracht worden",
    "uitzendklussen",
    "werken via een uitzendbureau",
    "flexwerk zonder KVK",
  ],
  ...canonical("/uitzendbureau"),
  // 21 nov 2026: /uitzendbureau stuurt door naar /starten-als-uitzendkracht (next.config.mjs) en staat niet meer in de sitemap.
  robots: { index: false, follow: true },
};

const PILLARS = [
  {
    title: "Kies zelf je klussen",
    body: "Werken via het platform betekent vrijheid voor jou. Je kiest zelf op welke uitzendklussen je reageert: heb je tijd, dan pak je een klus; zit je agenda vol, dan sla je hem over.",
  },
  {
    title: "Rechten van een werknemer",
    body: "Als uitzendkracht ben je in dienst van het uitzendbureau. Je bouwt vakantiegeld en pensioen op, en bij ziekte geldt de regeling uit de cao van het bureau.",
  },
  {
    title: "Je bureau regelt het papierwerk",
    body: "Het uitzendbureau regelt je contract, de loonaangifte en je loonstrook. Je stuurt geen facturen en hoeft geen btw-aangifte te doen.",
  },
];

const EXPECT = [
  {
    title: "Geen KVK, geen facturen",
    body: "Je hoeft geen eigen bedrijf te hebben. Het uitzendbureau van de klus is je werkgever: het regelt de loonaangifte, de afdrachten en je loonstrook.",
  },
  {
    title: "Loon van je uitzendbureau",
    body: "Je uitzendbureau betaalt je loon, met een loonstrook. Hoe vaak het bureau uitbetaalt, staat in je contract met het bureau.",
  },
  {
    title: "Vakantiegeld & vakantiedagen",
    body: "Je bouwt vakantiegeld en vakantie-uren op volgens de cao van het uitzendbureau. Wat je hebt opgebouwd, zie je op de loonstrook van het bureau.",
  },
  {
    title: "Pensioen volgens de cao",
    body: "Het uitzendbureau regelt je pensioen volgens zijn cao. Wanneer je opbouw begint en waar je hem terugziet, hoor je van je bureau.",
  },
  {
    title: "Reiskostenvergoeding",
    body: "Of je een reiskostenvergoeding krijgt en hoeveel, regelt het uitzendbureau volgens zijn cao en je contract.",
  },
  {
    title: "Alles in één app",
    body: "In de ZekerFlex-app zie je je uitzendklussen, je planning en je gewerkte uren. Je contract en je loonstroken krijg je van je uitzendbureau.",
  },
];

// het blok "fasen": geen eigen fasensysteem meer, wel wat de cao van het bureau regelt
const CAO_PUNTEN = [
  {
    tag: "Je contract",
    body: "Je tekent je uitzendcontract met het uitzendbureau van de klus, niet met ZekerFlex. Lees goed wat erin staat over uren, looptijd en opzeggen.",
  },
  {
    tag: "De cao",
    body: "Het bureau volgt zijn eigen uitzend-cao. Daarin staan je loon, toeslagen, vakantiegeld, pensioen en wat er gebeurt als je ziek bent.",
  },
  {
    tag: "Meer zekerheid",
    body: "Werk je langer via hetzelfde bureau, dan bouw je volgens die cao meer rechten op, zoals een contract voor bepaalde of onbepaalde tijd.",
  },
];

const STEPS = [
  {
    title: "Maak je profiel aan",
    body: "Binnen vijf minuten sta je erop. Verifieer je identiteit en kijk welke uitzendklussen er bij jou in de buurt zijn.",
  },
  {
    title: "Kies een uitzendklus",
    body: "Uitzendklussen staan in de app onder de naam van het aangesloten uitzendbureau. Zo zie je meteen wie je werkgever wordt.",
  },
  {
    title: "Vraag je uitzendcontract aan",
    body: "Met één knop vraag je een uitzendcontract aan bij het bureau van de klus. Het bureau neemt contact met je op en regelt het contract met je.",
  },
  {
    title: "Werk en krijg je loon",
    body: "Je checkt in met de app en je uren staan erin. Je uitzendbureau betaalt je loon volgens zijn cao, met een loonstrook.",
  },
];

// het blok "verloning": wie doet wat
const VERDELING = [
  {
    wie: "In de ZekerFlex-app",
    punten: [
      "Uitzendklussen van aangesloten uitzendbureaus",
      "Met één knop een uitzendcontract aanvragen",
      "Inchecken en je gewerkte uren",
      "Je profiel, reviews en werkhistorie",
    ],
  },
  {
    wie: "Bij je uitzendbureau",
    punten: [
      "Je uitzendcontract",
      "Je loon en je loonstroken",
      "Vakantiegeld en vakantie-uren",
      "Pensioen en loon bij ziekte, volgens de cao",
    ],
  },
];

const ROUTES = [
  {
    kind: "Uitzendkracht",
    who: "Je wilt flexibel werken zonder eigen onderneming.",
    points: ["Geen KVK nodig", "Loonstrook van je uitzendbureau", "Vakantiegeld en pensioen volgens de cao", "Het uitzendbureau is je werkgever"],
    highlight: true,
  },
  {
    kind: "Flexwerker",
    who: "Je werkt af en toe zelfstandig, soms met de kleineondernemersregeling.",
    points: ["Btw optioneel of KOR", "Self-invoice of reverse billing", "Eigen tarief, eigen ritme", "Lichte fiscale administratie"],
    highlight: false,
  },
  {
    kind: "Zzp'er",
    who: "Je hebt een eigen bedrijf met KVK en btw-nummer.",
    points: ["Reverse billing", "Zelf je uitbetaalsnelheid kiezen", "Wet DBA-monitor & modelovereenkomst", "Volledige zelfstandigheid"],
    highlight: false,
  },
];

const FAQ = [
  {
    q: "Wat is het verschil tussen freelance klussen en uitzendklussen?",
    a: "Bij een freelance klus heb je geen arbeidsovereenkomst en ben je niet in dienst — bij de opdrachtgever noch bij ZekerFlex. Bij een uitzendklus heb je een uitzendovereenkomst met het aangesloten uitzendbureau dat de klus plaatst, en ben je dus in dienst bij dat bureau. Een uitzendovereenkomst is een speciaal soort arbeidsovereenkomst: je hebt werknemersrechten zoals vakantiegeld en pensioen.",
  },
  {
    q: "Wie is mijn werkgever bij een uitzendklus?",
    a: "Het uitzendbureau dat de klus plaatst. Je ziet de naam van het bureau bij de klus. Het bureau tekent het contract met je, betaalt je loon en regelt vakantiegeld en pensioen volgens zijn cao. ZekerFlex is zelf geen uitzendbureau: wij brengen je in contact met het bureau en regelen de app.",
  },
  {
    q: "Ben ik ergens toe verplicht met een uitzendcontract?",
    a: "Dat staat in het contract van het uitzendbureau. Je tekent het met het bureau zelf, dus lees goed wat erin staat over uren, looptijd en opzeggen. In de ZekerFlex-app kies je zelf op welke klussen je reageert.",
  },
  {
    q: "Hoeveel verdien ik met uitzendklussen?",
    a: "Dat hangt af van de cao van het uitzendbureau en de afspraken bij de klus. Dit verschilt per sector en per bureau. Bij uitzendklussen wordt een deel ingehouden op je loon voor belastingen en premies. Daar staat tegenover dat je vakantiegeld, pensioen en andere cao-voordelen krijgt.",
  },
  {
    q: "Moet ik btw-aangifte doen bij uitzendklussen?",
    a: "Nee, dat is alleen zo bij freelance klussen. Bij uitzendklussen betaal je geen omzetbelasting (btw), omdat je niet als zzp'er werkt maar in dienst bent van het uitzendbureau.",
  },
  {
    q: "Hoe herken ik een uitzendklus?",
    a: "Aan elke klus hangt een label 'freelance' of 'uitzenden'. Bij een uitzendklus staat ook de naam van het uitzendbureau. Met het filter 'werktype' filter je makkelijk op uitzendklussen of freelance klussen.",
  },
  {
    q: "Kan ik ook nog freelancen als ik uitzendklussen doe?",
    a: "Zeker. Je kunt freelance klussen en uitzendklussen door elkaar doen. Let er wel op dat je over de freelance klussen nog btw moet afdragen, tenzij je deelneemt aan de KOR (kleineondernemersregeling).",
  },
  {
    q: "Wanneer krijg ik mijn loon?",
    a: "Je uitzendbureau betaalt je loon. Hoe vaak dat gebeurt, staat in je contract met het bureau; je loonstrook krijg je ook van het bureau.",
  },
  {
    q: "Bouw ik pensioen op?",
    a: "Ja, als uitzendkracht bouw je pensioen op via de regeling van je uitzendbureau, volgens zijn cao. Wanneer de opbouw begint, hoor je van het bureau.",
  },
  {
    q: "Kan ik later overstappen naar zzp?",
    a: "Zeker. Veel mensen beginnen als uitzendkracht en stappen over zodra ze een KVK hebben. Je werkgeschiedenis en reviews op ZekerFlex blijven gewoon staan.",
  },
];

export default async function UitzendbureauPage() {
  const openCount = await prisma.shift
    .count({
      where: {
        status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] },
        startsAt: { gte: new Date() },
      },
    })
    .catch(() => 0);

  // de onderdelen onder de kop: volgorde en zichtbaarheid uit de Site-ontwerper (Pagina's); zonder eigen indeling exact de standaard
  const onderdelen: Record<string, ReactNode> = {
    // Drie pijlers
    pijlers: (
      <Section tone="paper">
        <SectionHead
          eyebrow="Waarom uitzendklussen"
          title="Vrijheid van flex, rechten van een dienstverband"
        />
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title}>
              <h3 className="font-display text-xl font-semibold">{p.title}</h3>
              <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">{p.body}</p>
            </div>
          ))}
        </div>
      </Section>
    ),
    // Wat kun je verwachten
    verwachtingen: (
      <Section tone="soft">
        <div id="verwachtingen" className="scroll-mt-24">
          <SectionHead
            eyebrow="De verwachtingen"
            title="Precies wat je krijgt als uitzendkracht"
            intro="Duidelijkheid vooraf: wat ZekerFlex doet en wat je uitzendbureau regelt."
          />
        </div>
        <div className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-2">
          {EXPECT.map((b) => (
            <div key={b.title}>
              <h3 className="font-display text-xl font-semibold">{b.title}</h3>
              <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">{b.body}</p>
            </div>
          ))}
        </div>
      </Section>
    ),
    // In 4 stappen
    stappen: (
      <Section tone="paper">
        <SectionHead
          eyebrow="Zo begin je"
          title="Start met uitzendklussen in 4 stappen"
        />
        <ol className="mt-12 grid gap-6 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="num flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 font-mono text-sm text-white">
                {i + 1}
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-[0.95rem] leading-relaxed text-neutralx-600">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    ),
    // Zekerheid volgens de cao van het bureau (vroeger het fasensysteem; de sleutel blijft voor de Site-ontwerper)
    fasen: (
      <Section tone="soft">
        <div id="fasen" className="scroll-mt-24" />
        <SectionHead
          eyebrow="Zekerheid die meegroeit"
          title="Je rechten komen uit de cao van je uitzendbureau"
          intro="Het uitzendbureau van de klus is je werkgever. Zijn cao bepaalt je rechten, en hoe die groeien als je langer werkt."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {CAO_PUNTEN.map((p) => (
            <div key={p.tag} className="card h-full p-6">
              <span className="font-display text-lg font-bold text-brand-500">{p.tag}</span>
              <p className="mt-3 text-sm leading-relaxed text-neutralx-600">{p.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-sm text-neutralx-500">
          Welke cao geldt en welke rechten je al hebt opgebouwd, hoor je van je uitzendbureau.
        </p>
      </Section>
    ),
    // Kernboodschap (21 nov 2026: was een citaat van een uitzendkracht; er is nog geen aangesloten bureau, dus geen citaat)
    ervaring: (
      <Section tone="ink">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-display text-2xl font-semibold leading-snug text-white md:text-[1.7rem]">
            Werken wanneer het jou uitkomt, met een contract bij een uitzendbureau.
          </p>
          <p className="mt-5 text-sm text-white/60">Pensioen, vakantiegeld en loon volgens de cao van het bureau.</p>
        </div>
      </Section>
    ),
    // Drie routes
    routes: (
      <Section tone="paper">
        <div id="routes" className="scroll-mt-24" />
        <SectionHead
          eyebrow="Kies wat bij je past"
          title="Drie manieren om via ZekerFlex te werken"
          intro="Je kunt altijd later wisselen. Je profiel, reviews en werkhistorie gaan met je mee."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {ROUTES.map((r) => (
            <div
              key={r.kind}
              className={`h-full rounded-2xl p-6 ${
                r.highlight ? "bg-brand-500 text-white shadow-lift" : "border border-hair bg-paper"
              }`}
            >
              <h3 className="font-display text-xl font-bold">{r.kind}</h3>
              <p className={`mt-1.5 text-sm ${r.highlight ? "text-white/75" : "text-neutralx-500"}`}>
                {r.who}
              </p>
              <ul className="mt-4 space-y-2">
                {r.points.map((pt) => (
                  <li
                    key={pt}
                    className={`flex gap-2 text-sm ${r.highlight ? "text-white/90" : "text-neutralx-600"}`}
                  >
                    <span aria-hidden>·</span>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    ),
    // Wie doet wat: de app van ZekerFlex, het contract en het loon bij het bureau
    verloning: (
      <Section tone="soft">
        <div id="verloning" className="scroll-mt-24" />
        <SectionHead
          eyebrow="Duidelijk verdeeld"
          title="Wat ZekerFlex doet en wat je uitzendbureau regelt"
          intro="ZekerFlex is de app waarin je klussen vindt en je uren bijhoudt. Het uitzendbureau is je werkgever."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {VERDELING.map((v) => (
            <div key={v.wie} className="rounded-2xl border border-hair bg-paper p-6">
              <h3 className="font-display text-lg font-semibold">{v.wie}</h3>
              <ul className="mt-3 space-y-2">
                {v.punten.map((t) => (
                  <li key={t} className="flex gap-2 text-sm text-ink-soft">
                    <span aria-hidden>·</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    ),
    werkgevers: (
      <Section>
        <div id="werkgevers" className="scroll-mt-24" />
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <SectionHead
              eyebrow="Voor werkgevers"
              title="Uitzendkrachten nodig voor je bedrijf?"
            />
            <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-soft">
              ZekerFlex brengt je in contact met een aangesloten uitzendbureau. Het uitzendbureau is de werkgever van de
              uitzendkracht en regelt het contract, het loon en de loonadministratie; jij regelt alleen de bezetting. Vul
              het formulier in en we nemen contact op om je vraag te bespreken.
            </p>
            {/* 21 nov 2026: uitzendbureaus zelf kunnen hun klussen op ZekerFlex zetten en werkgever blijven */}
            <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-soft">
              Ben je zelf een uitzendbureau?{" "}
              <Link href="/uitzendpartner" className="font-semibold text-brand-600 underline">
                Zet je uitzendklussen op ZekerFlex
              </Link>
              .
            </p>
          </div>
          <UitzendbureauContactForm />
        </div>
      </Section>
    ),
    faq: (
      <Section tone="paper">
        <div id="faq" className="scroll-mt-24" />
        <SectionHead eyebrow="Veelgestelde vragen" title="Alles over uitzendklussen" />
        <div className="mt-10">
          <FaqList items={FAQ} />
        </div>
        <p className="mt-8 text-sm text-neutralx-500">
          Nog vragen over uitzendwerk via ZekerFlex? Mail{" "}
          <a href="mailto:uitzendbureau@zekerflex.com" className="text-brand-600 underline">
            uitzendbureau@zekerflex.com
          </a>
          .
        </p>
      </Section>
    ),
    slot: (
      <CtaBand
        title="Begin als uitzendkracht via ZekerFlex"
        body="Aanmelden kost een paar minuten. Geen KVK nodig: je werkt via een aangesloten uitzendbureau, dat je contract en loon regelt."
        primaryLabel="Aanmelden als uitzendkracht"
        primaryHref="/register?type=uitzendkracht"
        secondaryLabel="Bekijk alle werkvormen"
        secondaryHref="/voor-freelancers"
      />
    ),
  };
  const zichtbaar = zichtbareSecties("uitzendbureau", await getPaginaIndeling("uitzendbureau"));
  return (
    <>
      {/* de vragen voor Google alleen als ze ook op de pagina staan: gestructureerde gegevens horen zichtbaar te zijn */}
      {zichtbaar.includes("faq") ? (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: ldJson({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQ.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            }),
          }}
        />
      ) : null}

      <UitzendJobBoard openCount={openCount} />

      <PaginaVideoBlok id="uitzendbureau" />

      {zichtbaar.map((id) => (
        <Fragment key={id}>{onderdelen[id]}</Fragment>
      ))}
    </>
  );
}
