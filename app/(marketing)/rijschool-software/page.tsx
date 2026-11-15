import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

export const metadata: Metadata = {
  title: "Rijschoolsoftware: agenda, leerlingen, tegoed en eigen app",
  description:
    "Rijschoolsoftware van ZekerFlex: lesagenda, leerlingen met tegoed, leskaart na elke les, betalen, een website met proefles-planner en een eigen app voor je leerlingen.",
  ...canonical("/rijschool-software"),
};

// /rijschool-software (15 nov 2026): de openbare pagina voor rijschoolhouders. Het product bestond al (werkruimte Rijschool,
// lib/rijschool/), maar had geen eigen ingang. Opzet naar het voorbeeld van de betere rijschoolsoftware: weinig tekst, per
// onderdeel één blok, en één duidelijke actie. Alles op de pagina bestaat echt (lib/rijschool/, components/rijschool/); geen
// verzonnen aantallen, cijfers over klanten, en geen prijs: die is nog niet vastgelegd. Wat nog niet kan, staat onderaan.

const BEGIN = "/register?type=bedrijf&dashboard=rijschool";

const BLOKKEN: { id: string; kop: string; tekst: string; punten: string[] }[] = [
  {
    id: "planning",
    kop: "Planning",
    tekst: "Al je lessen in één agenda. Een les inplannen kan niet dubbel: de agenda weigert een tijd die al bezet is.",
    punten: ["Lessen, proeflessen, toetsen en examens per instructeur en per auto", "Leerlingen annuleren zelf binnen de termijn die jij kiest", "De avond ervoor gaat er automatisch een herinnering uit", "Een les kost tegoed, of wordt apart betaald: dat bepaal je per soort les"],
  },
  {
    id: "betalen",
    kop: "Tegoed en betalen",
    tekst: "Je ziet altijd hoeveel lessen een leerling nog goed heeft. Pakketten hebben een vaste prijs, zonder verrassingen.",
    punten: ["Pakketten en prijzen stel je zelf in", "Tegoed in minuten, met een logboek van elke wijziging", "Online betalen via je eigen betaalaccount", "Niet verschenen? Het tegoed gaat eraf, zoals jij het afspreekt"],
  },
  {
    id: "leskaart",
    kop: "Leskaart na elke les",
    tekst: "De instructeur vinkt na de les af wat goed ging. De leerling ziet de voortgang per onderdeel en wat het huiswerk is.",
    punten: ["Zes fasen met 29 onderdelen en een score van 1 tot 5", "Notities voor jezelf blijven intern; de leerling ziet ze nooit", "De route van de les opnemen in de instructeurapp", "Oefenen voor de leerling: uitleg per onderdeel en theorievragen met uitleg"],
  },
  {
    id: "app",
    kop: "Je eigen app",
    tekst: "Leerlingen en instructeurs hebben een eigen app met de naam en kleuren van jouw rijschool.",
    punten: ["Leerlingapp: volgende les, tegoed, leskaart en berichten", "Instructeurapp: de dag, het lesscherm en de leskaart", "Een eigen Android-app onder jouw naam in Google Play (jij hebt een eigen ontwikkelaarsaccount)", "Installeerbaar op elke telefoon, ook zonder winkel"],
  },
  {
    id: "website",
    kop: "Website met proefles-planner",
    tekst: "Een website voor je rijschool is meteen klaar. Een nieuwe leerling plant zelf een proefles in, 24 uur per dag.",
    punten: ["Teksten, foto's en kleuren pas je zelf aan", "Op je eigen domeinnaam, met het slotje geregeld", "Een assistent beantwoordt vragen van bezoekers", "Een bezoeker die een proefles boekt, staat meteen bij je leerlingen"],
  },
  {
    id: "overstappen",
    kop: "Overstappen",
    tekst: "Kom je uit andere software of een Excel-lijst? Neem je leerlingen over in één keer, zonder ze opnieuw in te typen.",
    punten: ["Exporteer je leerlingen als CSV en kies het bestand, of plak de tekst", "Je ziet eerst een voorbeeld en welke regels worden overgeslagen", "Naam, e-mail, telefoon en adres worden meegenomen", "Er gaat geen mail naar je leerlingen: uitnodigen doe je zelf, wanneer jij wilt"],
  },
  {
    id: "contact",
    kop: "Contact met leerlingen",
    tekst: "Berichten, mail en WhatsApp op één plek, zodat je niet meer in drie apps zoekt.",
    punten: ["Berichten tussen instructeur en leerling in de app", "Vaste mails, zoals de herinnering en de uitnodiging", "Antwoord op een mail komt bij jouw rijschool terecht", "Een WhatsApp-knop op je website"],
  },
];

const NOG_NIET = ["Een koppeling met CBR TOP voor examens", "Een Code 95-module voor chauffeurs", "Lessen en tegoed overnemen uit je oude software (leerlingen kan wel, zie Overstappen)"];

export default function RijschoolSoftwarePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbJsonLd([["Home", "/"], ["Rijschoolsoftware", "/rijschool-software"]])) }}
      />
      <div className="hero-ink text-white">
        <div className="shell py-16 text-center md:py-24">
          <p className="eyebrow text-brand-mint">ZekerFlex voor rijscholen en instructeurs</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">Rijschoolsoftware die gewoon werkt</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/70">
            Lesagenda, leerlingen, tegoed en betalen op één plek. Met een website waarop nieuwe leerlingen zelf een proefles plannen en een eigen app voor je rijschool.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={BEGIN} className="btn-mint px-6 py-3">
              Probeer het gratis
            </Link>
            <Link href="/demo" className="btn-ghost-invert px-6 py-3">
              Plan een demonstratie
            </Link>
          </div>
          <p className="mt-5 text-sm text-white/60">Een account maken kost niets. Je kunt alles rustig bekijken voor je iets instelt.</p>
        </div>
      </div>

      <nav aria-label="Onderdelen" className="border-b border-neutralx-200 bg-white">
        <ul className="shell flex gap-2 overflow-x-auto py-3 text-sm">
          {BLOKKEN.map((b) => (
            <li key={b.id} className="shrink-0">
              <a href={`#${b.id}`} className="rounded-full px-3 py-1.5 font-medium text-neutralx-700 hover:bg-paper">
                {b.kop}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {BLOKKEN.map((b, i) => (
        <section key={b.id} id={b.id} className={i % 2 === 0 ? "bg-paper" : "bg-white"} aria-labelledby={`${b.id}-kop`}>
          <div className="shell grid items-center gap-8 py-14 md:grid-cols-2 md:py-20">
            <div className={i % 2 === 0 ? "" : "md:order-2"}>
              <h2 id={`${b.id}-kop`} className="font-display text-3xl font-bold text-ink md:text-4xl">
                {b.kop}
              </h2>
              <p className="mt-3 text-lg leading-relaxed text-neutralx-600">{b.tekst}</p>
            </div>
            <ul className={`surface space-y-3 p-6 ${i % 2 === 0 ? "" : "md:order-1"}`}>
              {b.punten.map((p) => (
                <li key={p} className="flex gap-3 text-sm leading-relaxed text-ink">
                  <span aria-hidden className="mt-0.5 font-bold text-brand-700">
                    ✓
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="bg-paper" aria-labelledby="eerlijk">
        <div className="shell py-14 md:py-20">
          <h2 id="eerlijk" className="font-display text-3xl font-bold text-ink md:text-4xl">
            Wat er nog niet in zit
          </h2>
          <p className="mt-2 max-w-2xl text-neutralx-600">Beter nu weten dan na je keuze. Dit kan ZekerFlex voor rijscholen nog niet:</p>
          <ul className="mt-6 max-w-2xl list-disc space-y-2 pl-5 text-neutralx-700">
            {NOG_NIET.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="hero-ink text-white" aria-labelledby="begin">
        <div className="shell py-14 text-center md:py-20">
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
      </section>
    </>
  );
}
