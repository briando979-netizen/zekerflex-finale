import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { AgendaKaart, LeerlingTelefoon, LeskaartKaart, SiteKaart, TegoedKaart } from "@/components/marketing/rijschool/Mockups";

export const metadata: Metadata = {
  title: "Rijschoolsoftware: agenda, leerlingen, tegoed en eigen app",
  description:
    "Rijschoolsoftware van ZekerFlex: lesagenda, leerlingen met tegoed, leskaart na elke les, betalen, een website met proefles-planner en een eigen app voor je leerlingen.",
  ...canonical("/rijschool-software"),
};

// /rijschool-software (15 nov 2026): de openbare pagina voor rijschoolhouders, opgezet naar de betere rijschoolsoftware
// (PlanRijles, PlanGo): een lichte kop met het product in beeld, per onderdeel een blok met een voorbeeldkaart, voor wie het is,
// overstappen, een korte start in drie stappen, vragen en een duidelijke afsluiting. Alles op de pagina bestaat echt
// (lib/rijschool/, components/rijschool/); de voorbeeldkaarten dragen het label "Voorbeeld". Geen verzonnen aantallen, cijfers
// over klanten of waarderingen, en geen prijs: die is nog niet vastgelegd. Wat nog niet kan, staat onderaan.

const BEGIN = "/register?type=bedrijf&dashboard=rijschool";

interface Blok {
  id: string;
  kop: string;
  kort: string;
  tekst: string;
  punten: string[];
  beeld: ReactNode;
}

const BLOKKEN: Blok[] = [
  {
    id: "planning",
    kop: "Planning die niet dubbel boekt",
    kort: "Planning",
    tekst: "Al je lessen in één agenda, per instructeur en per auto. Een tijd die al bezet is, weigert de agenda.",
    punten: ["Lessen, proeflessen, toetsen en examens", "Leerlingen annuleren zelf binnen de termijn die jij kiest", "De avond ervoor gaat er automatisch een herinnering uit", "Een les kost tegoed, of wordt apart betaald: dat bepaal je per soort les"],
    beeld: <AgendaKaart />,
  },
  {
    id: "betalen",
    kop: "Tegoed en betalen, altijd in beeld",
    kort: "Tegoed en betalen",
    tekst: "Je ziet per leerling hoeveel tegoed er over is en wat er is afgeschreven. Pakketten hebben een vaste prijs, zonder verrassingen.",
    punten: ["Pakketten en prijzen stel je zelf in", "Tegoed in minuten, met een logboek van elke wijziging", "Online betalen via je eigen betaalaccount", "Niet verschenen? Het tegoed gaat eraf, zoals jij het afspreekt"],
    beeld: <TegoedKaart />,
  },
  {
    id: "leskaart",
    kop: "Een leskaart na elke les",
    kort: "Leskaart",
    tekst: "De instructeur geeft na de les per onderdeel een score van 1 tot 5. De leerling ziet waar hij staat en wat het huiswerk is.",
    punten: ["Zes fasen met 29 onderdelen, van Auto en bediening tot Zelfstandig en examen", "Notities voor jezelf blijven intern: de leerling ziet ze nooit", "De route van de les opnemen in de instructeurapp", "Oefenen voor de leerling: uitleg per onderdeel en theorievragen met uitleg"],
    beeld: <LeskaartKaart />,
  },
  {
    id: "app",
    kop: "Een eigen app voor je leerlingen",
    kort: "Eigen app",
    tekst: "Leerlingen en instructeurs hebben een eigen app met de naam en kleuren van jouw rijschool.",
    punten: ["Leerlingapp: volgende les, tegoed, leskaart en berichten", "Instructeurapp: de dag, het lesscherm en de leskaart", "Installeerbaar op elke telefoon, ook zonder winkel", "Wil je een eigen Android-app onder jouw naam in Google Play? Dat kan, met je eigen ontwikkelaarsaccount"],
    beeld: <LeerlingTelefoon />,
  },
  {
    id: "website",
    kop: "Een website met proefles-planner",
    kort: "Website",
    tekst: "Je website is meteen klaar. Een nieuwe leerling plant zelf een proefles, 24 uur per dag.",
    punten: ["Teksten, foto's en kleuren pas je zelf aan", "Op je eigen domeinnaam, met het slotje geregeld", "Een assistent beantwoordt vragen van bezoekers", "Een bezoeker die een proefles boekt, staat meteen bij je leerlingen"],
    beeld: <SiteKaart />,
  },
];

const VOOR_WIE = [
  { kop: "Zelfstandig instructeur", tekst: "Eén persoon, één agenda. Je leerlingen plannen zelf, jij ziet je tegoed en je dag op je telefoon." },
  { kop: "Rijschool met instructeurs", tekst: "Meer instructeurs en auto's in één agenda, met per instructeur zijn eigen leerlingen en een overzicht voor jou." },
  { kop: "Overstappen van andere software", tekst: "Neem je leerlingen over uit een lijst en begin dezelfde week. Lessen en tegoed neem je niet automatisch mee." },
];

const STAPPEN = [
  { kop: "Maak een account", tekst: "Een account voor je rijschool maken kost niets." },
  { kop: "Zet Rijschool aan", tekst: "Kies in je werkomgeving de werkruimte Rijschool. Je krijgt meteen een website en een lege agenda." },
  { kop: "Neem je leerlingen over", tekst: "Voer ze in of neem ze over uit een CSV-bestand en nodig ze uit voor hun app." },
];

const VRAGEN = [
  { vraag: "Wat kost het?", antwoord: "Een account maken kost niets. De prijs van het rijschoolpakket staat nog niet vast; vraag gerust een demonstratie aan, dan hoor je wat er mogelijk is." },
  { vraag: "Kan ik mijn leerlingen overnemen uit mijn oude software?", antwoord: "Ja, uit een CSV-bestand of Excel-lijst: naam, e-mail, telefoon en adres. Je ziet eerst een voorbeeld en er gaat geen mail naar je leerlingen. Lessen en tegoed neem je nu nog niet automatisch over." },
  { vraag: "Moet mijn leerling iets installeren?", antwoord: "Nee. De leerlingapp werkt op elke telefoon en is te installeren zonder winkel. Heeft je rijschool liever een eigen Android-app in Google Play, dan kan dat via je eigen ontwikkelaarsaccount." },
  { vraag: "Wat zit er nog niet in?", antwoord: "Een koppeling met CBR TOP voor examens, een Code 95-module voor chauffeurs en het automatisch overnemen van lessen en tegoed uit je oude software." },
];

const NOG_NIET = ["Een koppeling met CBR TOP voor examens", "Een Code 95-module voor chauffeurs", "Lessen en tegoed overnemen uit je oude software (leerlingen kan wel)"];

function Vink() {
  return (
    <span aria-hidden className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-white">
      ✓
    </span>
  );
}

export default function RijschoolSoftwarePage() {
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: VRAGEN.map((v) => ({ "@type": "Question", name: v.vraag, acceptedAnswer: { "@type": "Answer", text: v.antwoord } })),
  };
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson([breadcrumbJsonLd([["Home", "/"], ["Rijschoolsoftware", "/rijschool-software"]]), faq]) }}
      />

      <section className="bg-white" aria-labelledby="hero-kop">
        <div className="shell grid items-center gap-12 py-14 md:py-20 lg:grid-cols-2">
          <div>
            <p className="eyebrow">ZekerFlex voor rijscholen en instructeurs</p>
            <h1 id="hero-kop" className="mt-4 text-balance font-display text-4xl font-bold leading-[1.08] text-ink md:text-6xl">
              Rijschoolsoftware die je lessen, leerlingen en betalingen regelt
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutralx-600">
              Lesagenda, leerlingen met tegoed, een leskaart na elke les en een eigen app voor je leerlingen. Met een website waarop nieuwe leerlingen zelf een proefles plannen.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={BEGIN} className="btn-primary px-6 py-3">
                Probeer het gratis
              </Link>
              <Link href="/demo" className="btn-ghost px-6 py-3">
                Plan een demonstratie
              </Link>
            </div>
            <p className="mt-4 text-sm text-neutralx-500">Een account maken kost niets. Je kunt alles rustig bekijken voor je iets instelt.</p>
          </div>
          <div className="relative mx-auto flex w-full max-w-xl justify-center py-6 pr-10">
            <span aria-hidden className="absolute inset-x-4 inset-y-0 rounded-[3rem] bg-mintwash" />
            <AgendaKaart className="relative -rotate-1" />
            <LeerlingTelefoon className="absolute -bottom-8 -right-4 hidden !w-40 !border-[5px] !p-3 rotate-2 sm:block" />
          </div>
        </div>
      </section>

      <nav aria-label="Onderdelen" className="border-y border-hair bg-white">
        <ul className="shell flex gap-1 overflow-x-auto py-3 text-sm">
          {BLOKKEN.map((b) => (
            <li key={b.id} className="shrink-0">
              <a href={`#${b.id}`} className="rounded-full px-3 py-1.5 font-medium text-neutralx-700 hover:bg-paper">
                {b.kort}
              </a>
            </li>
          ))}
          <li className="shrink-0">
            <a href="#overstappen" className="rounded-full px-3 py-1.5 font-medium text-neutralx-700 hover:bg-paper">
              Overstappen
            </a>
          </li>
        </ul>
      </nav>

      <section className="bg-paper" aria-labelledby="voor-wie-kop">
        <div className="shell py-14 md:py-20">
          <h2 id="voor-wie-kop" className="text-center font-display text-3xl font-bold text-ink md:text-4xl">
            Voor elke rijschool
          </h2>
          <ul className="mt-10 grid gap-5 md:grid-cols-3">
            {VOOR_WIE.map((v) => (
              <li key={v.kop} className="rounded-2xl border border-hair bg-white p-6 shadow-sm">
                <h3 className="font-display text-xl font-bold text-ink">{v.kop}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{v.tekst}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {BLOKKEN.map((b, i) => (
        <section key={b.id} id={b.id} className={`scroll-mt-20 ${i % 2 === 0 ? "bg-white" : "bg-paper-soft"}`} aria-labelledby={`${b.id}-kop`}>
          <div className="shell grid items-center gap-12 py-14 md:py-24 lg:grid-cols-2">
            <div className={i % 2 === 0 ? "" : "lg:order-2"}>
              <h2 id={`${b.id}-kop`} className="text-balance font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
                {b.kop}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-neutralx-600">{b.tekst}</p>
              <ul className="mt-6 space-y-3">
                {b.punten.map((p) => (
                  <li key={p} className="flex gap-3 text-sm leading-relaxed text-ink">
                    <Vink />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <Link href={BEGIN} className="btn-primary mt-8 inline-block px-6 py-3">
                Probeer het gratis
              </Link>
            </div>
            <div className={`mx-auto flex w-full justify-center rounded-[2rem] bg-mintwash p-6 md:p-10 ${i % 2 === 0 ? "" : "lg:order-1"}`}>{b.beeld}</div>
          </div>
        </section>
      ))}

      <section id="overstappen" className="scroll-mt-20 bg-white" aria-labelledby="overstappen-kop">
        <div className="shell py-14 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="overstappen-kop" className="font-display text-3xl font-bold text-ink md:text-4xl">
              Overstappen zonder gedoe
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-neutralx-600">
              Kom je uit andere software of een Excel-lijst? Neem je leerlingen over in één keer, zonder ze opnieuw in te typen. Er gaat geen mail naar je leerlingen: uitnodigen doe je zelf, wanneer jij wilt.
            </p>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STAPPEN.map((s, i) => (
              <li key={s.kop} className="rounded-2xl border border-hair bg-paper p-6">
                <p aria-hidden className="font-display text-3xl font-bold text-brand-700">
                  {i + 1}
                </p>
                <h3 className="mt-2 font-display text-xl font-bold text-ink">{s.kop}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{s.tekst}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-paper" aria-labelledby="vragen-kop">
        <div className="shell py-14 md:py-20">
          <h2 id="vragen-kop" className="font-display text-3xl font-bold text-ink md:text-4xl">
            Veelgestelde vragen
          </h2>
          <div className="mt-8 divide-y divide-hair rounded-2xl border border-hair bg-white">
            {VRAGEN.map((v) => (
              <details key={v.vraag} className="group px-6 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink">
                  {v.vraag}
                  <span aria-hidden className="text-neutralx-500 transition-transform group-open:rotate-180">
                    ⌄
                  </span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-neutralx-600">{v.antwoord}</p>
              </details>
            ))}
          </div>
          <h3 className="mt-10 font-display text-xl font-bold text-ink">Wat er nog niet in zit</h3>
          <p className="mt-2 text-sm text-neutralx-600">Beter nu weten dan na je keuze. Dit kan ZekerFlex voor rijscholen nog niet:</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutralx-700">
            {NOG_NIET.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white pb-14 md:pb-24" aria-labelledby="begin">
        <div className="shell">
          <div className="hero-ink rounded-3xl px-6 py-12 text-center text-white md:px-12 md:py-16">
            <h2 id="begin" className="font-display text-3xl font-bold md:text-4xl">
              Begin vandaag met je rijschool
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-white/70">Maak een account voor je rijschool, zet de werkruimte Rijschool aan en nodig je eerste leerling uit. Liever eerst praten? Plan een demonstratie.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href={BEGIN} className="btn-mint px-6 py-3">
                Maak een gratis account
              </Link>
              <Link href="/demo" className="btn-ghost-invert px-6 py-3">
                Kies een tijd voor een demo
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
