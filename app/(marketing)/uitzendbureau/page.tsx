import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead, CtaBand, FaqList } from "@/components/marketing/primitives";
import { Photo } from "@/components/marketing/Photo";
import { SceneWork } from "@/components/marketing/Scene";

export const metadata: Metadata = {
  title: "Uitzendklussen via ZekerFlex",
  description:
    "Uitzendklussen via ZekerFlex: bepaal je eigen uren, krijg vakantiegeld, pensioen (StiPP) en reiskosten, en laat al het papierwerk geregeld zijn. ZekerFlex is je werkgever — geen KVK nodig.",
  alternates: { canonical: "/uitzendbureau" },
};

const QUICK = [
  "Bepaal je eigen uren",
  "Vakantiegeld + pensioen + reiskosten",
  "Al het papierwerk geregeld",
];

const PILLARS = [
  {
    title: "Bepaal je eigen uren",
    body: "Werken via het platform betekent vrijheid voor jou. Plan uitzendklussen wanneer jij tijd hebt en sla ze over als je agenda vol zit. Geen urenverplichting, geen vaste roosters.",
  },
  {
    title: "Meer rechten voor jou",
    body: "Als uitzendkracht spaar je vakantiegeld en bouw je pensioen op via StiPP. Ben je ziek? Dan hoef je geen vervanging te regelen en loopt je loondoorbetaling via ZekerFlex.",
  },
  {
    title: "Al het papierwerk geregeld",
    body: "ZekerFlex regelt de loonaangifte, de afdrachten en je loonstrook. Je krijgt vanzelf uitbetaald en hoeft geen btw-aangifte te doen. Make it easy.",
  },
];

const EXPECT = [
  {
    title: "Geen KVK, geen facturen",
    body: "Je hoeft geen eigen bedrijf te hebben. ZekerFlex is je formele werkgever tijdens de opdracht; wij regelen de loonaangifte, de afdrachten en de loonstrook.",
  },
  {
    title: "Wekelijkse verloning",
    body: "Je uren worden per kalenderweek verloond. Goedgekeurde uren op zondag betekenen loon op je rekening in de week erna, met een volledige digitale loonstrook.",
  },
  {
    title: "Vakantiegeld & vakantiedagen",
    body: "Je bouwt 8,33% vakantiegeld op en reserveert vakantie-uren (circa 10,83%). Beide staan als aparte reservering op je loonstrook en keer je uit wanneer je wilt.",
  },
  {
    title: "Pensioen via StiPP",
    body: "Vanaf week 9 bouw je automatisch pensioen op in de StiPP-basisregeling. ZekerFlex draagt het werkgeversdeel af; je ziet de opbouw terug in je overzicht.",
  },
  {
    title: "Reiskostenvergoeding",
    body: "Voor uitzendklussen geldt de reiskostenregeling uit de cao. De vergoeding staat vooraf bij de dienst en wordt automatisch op je loonstrook verwerkt.",
  },
  {
    title: "Alles terug te lezen",
    body: "In je dashboard vind je elke week: gewerkte uren, brutoloon, inhoudingen, reserveringen, je fase, je pensioenopbouw en elke loonstrook als pdf. Niets is een black box.",
  },
];

const PHASES = [
  {
    tag: "Fase A",
    weeks: "week 1–52",
    body: "Je werkt met een uitzendbeding: geen opdracht = geen loon, maar ook volledige vrijheid. Je bouwt rechten en fase-weken op bij elke gewerkte week.",
  },
  {
    tag: "Fase B",
    weeks: "na 52 weken",
    body: "Contracten voor bepaalde tijd (maximaal 6 in 3 jaar). Je krijgt loon doorbetaald bij ziekte en er gelden opzegtermijnen.",
  },
  {
    tag: "Fase C",
    weeks: "na fase B",
    body: "Een contract voor onbepaalde tijd bij ZekerFlex. Maximale zekerheid, met behoud van de flexibiliteit in het soort werk dat je doet.",
  },
];

const STEPS = [
  {
    title: "Maak je profiel aan",
    body: "Binnen vijf minuten sta je erop. Verifieer je identiteit en meld je aan voor uitzendklussen.",
  },
  {
    title: "Vraag je uitzendcontract aan",
    body: "Je uitzendovereenkomst met ZekerFlex staat digitaal klaar. Onderteken hem en je bent er klaar voor. Het contract geldt drie maanden en kent geen urenverplichting.",
  },
  {
    title: "Reageer op uitzendklussen",
    body: "In de app zie je welke uitzendklussen je kunt doen. Plan ze in wanneer jij er tijd voor hebt.",
  },
  {
    title: "Krijg automatisch uitbetaald",
    body: "Geef je uren door in de app, dan regelt ZekerFlex de verloning en uitbetaling. Je krijgt ook doorbetaald als je ziek bent en hoeft geen vervanging te regelen.",
  },
];

const ROUTES = [
  {
    kind: "Uitzendkracht",
    who: "Je wilt flexibel werken zonder eigen onderneming.",
    points: ["Geen KVK nodig", "Wekelijkse loonstrook", "Vakantiegeld, pensioen, fasenopbouw", "ZekerFlex is je werkgever"],
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
    a: "Bij een freelance klus heb je geen arbeidsovereenkomst en ben je niet in dienst — bij de opdrachtgever noch bij ZekerFlex. Bij een uitzendklus heb je een uitzendovereenkomst met ZekerFlex en ben je dus in dienst bij ZekerFlex. Een uitzendovereenkomst is een speciaal soort arbeidsovereenkomst: je hebt werknemersrechten zoals vakantiegeld, pensioen en reiskostenvergoeding.",
  },
  {
    q: "Ben ik ergens toe verplicht met een uitzendcontract bij ZekerFlex?",
    a: "Nee, er is geen urenverplichting. Je moet je natuurlijk wel aan het contract houden. Het uitzendcontract is drie maanden geldig; in die periode kun je alle uitzendklussen voor alle bedrijven doen. Na drie maanden vraag je een nieuw contract aan als je wilt doorwerken als uitzendkracht.",
  },
  {
    q: "Hoeveel verdien ik met uitzendklussen?",
    a: "Dat hangt af van de cao-afspraken die op de opdracht van toepassing zijn. Dit verschilt per sector en per bedrijf. Bij uitzendklussen wordt een deel ingehouden op je loon voor belastingen en premies. Daar staat tegenover dat je vakantiegeld, pensioen en andere cao-voordelen krijgt.",
  },
  {
    q: "Moet ik btw-aangifte doen bij uitzendklussen?",
    a: "Nee, dat is alleen zo bij freelance klussen. Bij uitzendklussen betaal je geen omzetbelasting (btw), omdat je niet als zzp'er werkt maar met een uitzendovereenkomst.",
  },
  {
    q: "Hoe herken ik een uitzendklus?",
    a: "Aan elke klus hangt een label 'freelance' of 'uitzenden'. Met het filter 'werktype' filter je makkelijk op uitzendklussen of freelance klussen.",
  },
  {
    q: "Kan ik ook nog freelancen als ik uitzendklussen doe?",
    a: "Zeker. Je kunt freelance klussen en uitzendklussen door elkaar doen. Let er wel op dat je over de freelance klussen nog btw moet afdragen, tenzij je deelneemt aan de KOR (kleineondernemersregeling).",
  },
  {
    q: "Wanneer krijg ik mijn loon?",
    a: "Wekelijks. We sluiten elke kalenderweek af; goedgekeurde uren worden in de week erna verloond en uitbetaald, inclusief een volledige digitale loonstrook in je dashboard.",
  },
  {
    q: "Bouw ik pensioen op?",
    a: "Ja, vanaf de negende gewerkte week ga je automatisch de StiPP-basisregeling in. Daarna geldt de StiPP-plusregeling. ZekerFlex draagt af en je opbouw is zichtbaar in je dashboard.",
  },
  {
    q: "Kan ik later overstappen naar zzp?",
    a: "Zeker. Veel mensen beginnen als uitzendkracht en stappen over zodra ze een KVK hebben. Je werkgeschiedenis en reviews op ZekerFlex blijven gewoon staan.",
  },
];

export default function UitzendbureauPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
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

      <div className="hero-ink text-white">
        <div className="shell grid gap-12 py-20 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-28">
          <div>
            <p className="eyebrow text-brand-mint">Via ons uitzendbureau</p>
            <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">
              Uitzendklussen: vrijheid én zekerheid ineen
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/70">
              Wil je leuke klussen doen wanneer het jou uitkomt? Terwijl je ook nog eens
              vakantiegeld krijgt en pensioen opbouwt? Dan zijn uitzendklussen via ZekerFlex
              wat voor jou. Geen KVK, geen facturen — ZekerFlex is je werkgever en verloont
              je elke week.
            </p>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">
              {QUICK.map((q) => (
                <li key={q} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-mint" />
                  {q}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register?type=uitzendkracht" className="btn-mint">
                Verdien geld met uitzendklussen
              </Link>
              <Link href="#verwachtingen" className="btn-ghost-invert">
                Wat kun je verwachten?
              </Link>
            </div>
          </div>
          <Photo name="team" fallback={<SceneWork />} className="shadow-lift" />
        </div>
      </div>

      {/* Drie pijlers */}
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

      {/* Wat kun je verwachten */}
      <Section tone="soft">
        <div id="verwachtingen" className="scroll-mt-24">
          <SectionHead
            eyebrow="De verwachtingen"
            title="Precies wat je krijgt als uitzendkracht"
            intro="Duidelijkheid vooraf. Dit is hoe het bij ZekerFlex geregeld is."
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

      {/* In 4 stappen */}
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

      {/* Fasensysteem */}
      <Section tone="soft">
        <div id="fasen" className="scroll-mt-24" />
        <SectionHead
          eyebrow="Zekerheid die meegroeit"
          title="Het ABU-fasensysteem, stap voor stap"
          intro="Hoe langer je via ZekerFlex werkt, hoe meer rechten en zekerheid je opbouwt."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PHASES.map((p) => (
            <div key={p.tag} className="card h-full p-6">
              <div className="flex items-baseline justify-between">
                <span className="font-display text-lg font-bold text-brand-500">{p.tag}</span>
                <span className="font-mono text-xs text-neutralx-400">{p.weeks}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-neutralx-600">{p.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-sm text-neutralx-500">
          ZekerFlex volgt de ABU-cao voor uitzendkrachten. Je exacte fase, opgebouwde weken en
          rechten staan altijd actueel in je dashboard.
        </p>
      </Section>

      {/* Testimonial */}
      <Section tone="ink">
        <figure className="mx-auto max-w-2xl text-center">
          <blockquote className="font-display text-2xl font-semibold leading-snug text-white md:text-[1.7rem]">
            &ldquo;Ik plan mijn uitzendklussen rond mijn opleiding. Werken met een vast rooster
            zou voor mij niet eens kunnen — en toch bouw ik pensioen op en krijg ik
            vakantiegeld.&rdquo;
          </blockquote>
          <figcaption className="mt-5 text-sm text-white/60">Anne · uitzendkracht in de horeca</figcaption>
        </figure>
      </Section>

      {/* Drie routes */}
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

      {/* Zo lees je alles terug */}
      <Section tone="soft">
        <div id="verloning" className="scroll-mt-24" />
        <SectionHead
          eyebrow="Volledig inzicht"
          title="Alles wat je verdient, terug te lezen"
          intro="In je dashboard onder ‘Verloning’ vind je elke week terug:"
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Gewerkte en goedgekeurde uren per dienst",
            "Brutoloon, toeslagen en het geldende uurloon",
            "Loonheffing en overige inhoudingen",
            "Vakantiegeld- en vakantie-urenreservering",
            "Reiskostenvergoeding per dienst",
            "Je actuele ABU-fase en opgebouwde weken",
            "Pensioenopbouw (StiPP) en werkgeversafdracht",
            "Netto-uitbetaling en betaaldatum",
            "Elke loonstrook als pdf, onbeperkt terug",
          ].map((t) => (
            <div key={t} className="rounded-xl border border-hair bg-paper p-4 text-sm text-ink-soft">
              {t}
            </div>
          ))}
        </div>
      </Section>

      <Section tone="paper">
        <div id="faq" className="scroll-mt-24" />
        <SectionHead eyebrow="Veelgestelde vragen" title="Alles over uitzendklussen" />
        <div className="mt-10">
          <FaqList items={FAQ} />
        </div>
        <p className="mt-8 text-sm text-neutralx-500">
          Nog vragen over werken via het uitzendbureau? Mail{" "}
          <a href="mailto:uitzendbureau@zekerflex.com" className="text-brand-600 underline">
            uitzendbureau@zekerflex.com
          </a>
          .
        </p>
      </Section>

      <CtaBand
        title="Begin als uitzendkracht bij ZekerFlex"
        body="Aanmelden kost een paar minuten. Geen KVK nodig — wij regelen de rest."
        primaryLabel="Aanmelden als uitzendkracht"
        primaryHref="/register?type=uitzendkracht"
        secondaryLabel="Bekijk alle werkvormen"
        secondaryHref="/voor-freelancers"
      />
    </>
  );
}
