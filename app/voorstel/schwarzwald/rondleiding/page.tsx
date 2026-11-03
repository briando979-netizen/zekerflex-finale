import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BASE } from "@/lib/voorstel/schwarzwald";

export const metadata: Metadata = { title: "Rondleiding" };

// Rondleiding voor Het Schwarzwald: wat deze voorstelsite voor gasten doet en
// wat het team achter de login krijgt (dat kunnen zij zelf niet inzien). De
// schermafbeeldingen zijn gemaakt met verzonnen demogegevens. Geen prijzen of
// voorwaarden: die bespreekt ZekerFlex zelf.

const FOTO = "/voorstel/schwarzwald/rondleiding";

const GASTEN: { titel: string; tekst: string; href?: string }[] = [
  { titel: "Direct reserveren", tekst: "Kies een activiteit en zie meteen welke dagen en tijden nog vrij zijn. Geen extern systeem meer nodig.", href: `${BASE}/reserveren` },
  { titel: "Wachtlijst bij volle dagen", tekst: "Is een dag vol? Gasten zetten zich op de wachtlijst en zien in hun account wanneer er een plek vrijkomt. Het team ziet het ook." },
  { titel: "Eerstvolgende vrije dagen", tekst: "Elke activiteitpagina toont de eerstvolgende dagen met plek, met één klik naar reserveren.", href: `${BASE}/activiteiten` },
  { titel: "Mijn account", tekst: "Reserveringen terugzien, zelf verzetten, het aantal wijzigen of annuleren, in de agenda zetten en delen met de groep.", href: `${BASE}/account` },
  { titel: "Blijf je eten?", tekst: "Na het boeken voorstellen om te blijven eten, met een aanvraag die al is ingevuld. Extra omzet voor het restaurant." },
  { titel: "Beoordelingen", tekst: "Na het bezoek schrijven gasten een beoordeling; het team keurt goed voordat die online komt." },
  { titel: "Offerte online", tekst: "Groepen en bedrijven zien hun offerte op een nette, printbare pagina." },
  { titel: "Nieuws en vacatures", tekst: "Eigen nieuwsberichten, en solliciteren op een vacature gaat direct via de site.", href: `${BASE}/nieuws` },
];

const BEHEER: { foto: string; titel: string; tekst: string; punten: string[] }[] = [
  {
    foto: "dashboard",
    titel: "Eén dashboard met wat er te doen is",
    tekst: "Bij het inloggen ziet het team meteen wat aandacht vraagt, met één klik naar de juiste plek.",
    punten: ["Te bevestigen reserveringen, nieuwe aanvragen en berichten", "Groepen zonder begeleider of met een dubbel ingeplande begeleider", "Cijfers voor vandaag, de komende week en de maand"],
  },
  {
    foto: "planning",
    titel: "Weekplanning in één oogopslag",
    tekst: "Alle groepen per dag en tijd, in de kleur van de activiteit. Wat tegelijk loopt, staat naast elkaar.",
    punten: ["Begeleider per groep, met een waarschuwing als iemand twee groepen tegelijk heeft", "Geblokkeerde momenten (besloten feest, onderhoud) zichtbaar", "Klik op een groep voor alle details"],
  },
  {
    foto: "reserveringen",
    titel: "Reserveringen en de balie",
    tekst: "Zoeken, filteren, bevestigen en zelf inboeken voor telefoon of balie. Op de dag zelf meldt het team gasten aan.",
    punten: ["Aangekomen of niet gekomen, met de stand per dag", "Begeleider kiezen per groep", "Aanvragen in één klik inboeken als reservering", "Export naar Excel"],
  },
  {
    foto: "dagplanning",
    titel: "Dagplanning om te printen",
    tekst: "Alles van één dag op papier voor de briefing: tijden, groepen, wensen en allergieën, per begeleider.",
    punten: ["Overzicht per begeleider", "Wensen uit het klantdossier erbij", "Afvinken wie er binnen is"],
  },
  {
    foto: "klant",
    titel: "Klantdossier (CRM)",
    tekst: "Per gast alles bij elkaar: reserveringen, aanvragen, notities, taken en berichten.",
    punten: ["Vaste klanten herkennen", "Wensen zoals dieet en allergieën", "Zien wie eerder niet kwam opdagen"],
  },
  {
    foto: "gast-account",
    titel: "Wat de gast ziet",
    tekst: "Gasten regelen veel zelf. Dat scheelt het team telefoontjes en mails.",
    punten: ["Verzetten en het aantal wijzigen; het team bevestigt", "In Google, Apple of Outlook-agenda zetten", "Eigen gegevens downloaden of laten verwijderen (AVG)"],
  },
];

const OOK: string[] = [
  "Pagina's, nieuws, activiteiten, openingstijden en een aankondigingsbalk zelf aanpassen",
  "Medewerkers zelf toegang geven tot het beheer",
  "Sollicitaties beheren; ze worden na 28 dagen vanzelf gewist (AVG)",
  "Getest op toegankelijkheid (WCAG 2.1 AA) en snel op de telefoon",
];

export default function RondleidingPage() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-schw-night text-schw-cream">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 -z-10 h-96 w-96 rounded-full bg-schw-orange/25 blur-3xl" />
        <div className="mx-auto max-w-[1280px] px-4 pb-14 pt-14 sm:px-8 lg:pt-20">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Rondleiding</p>
          <h1 className="mt-4 max-w-4xl font-display text-[clamp(2.6rem,7vw,5rem)] font-bold leading-[0.95] tracking-[-0.03em]">Wat deze site voor Het Schwarzwald doet</h1>
          <p className="mt-6 max-w-2xl text-lg text-schw-cream/80">
            Een eigen website met eigen agenda, accounts en beheer, gebouwd door ZekerFlex. Hieronder wat gasten ermee kunnen, en wat jullie team achter de login krijgt.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-14 sm:px-8" aria-labelledby="voor-gasten">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-rust">Voor gasten</p>
        <h2 id="voor-gasten" className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Zelf regelen, wanneer het hen uitkomt
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GASTEN.map((g) => (
            <li key={g.titel} className="flex flex-col rounded-xl3 bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
              <h3 className="font-display text-lg font-bold">{g.titel}</h3>
              <p className="mt-2 flex-1 text-sm text-schw-mute">{g.tekst}</p>
              {g.href && (
                <Link href={g.href} className="mt-4 text-sm font-bold text-schw-rust underline underline-offset-4">
                  Probeer het<span className="sr-only">: {g.titel.toLowerCase()}</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-schw-sand py-14" aria-labelledby="voor-team">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-rust">Voor jullie team</p>
          <h2 id="voor-team" className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Het beheer achter de login
          </h2>
          <p className="mt-3 max-w-2xl text-schw-night/80">Dit deel is alleen voor jullie medewerkers. De schermafbeeldingen zijn gemaakt met verzonnen voorbeeldgegevens.</p>
          <div className="mt-10 space-y-14">
            {BEHEER.map((b, i) => (
              <article key={b.foto} className="grid items-center gap-8 lg:grid-cols-2">
                <div className={i % 2 ? "lg:order-2" : ""}>
                  <Image
                    src={`${FOTO}/${b.foto}.webp`}
                    alt={`Schermafbeelding: ${b.titel.toLowerCase()}`}
                    width={1200}
                    height={750}
                    sizes="(min-width: 1024px) 600px, 100vw"
                    className="w-full rounded-xl3 shadow-[0_10px_30px_rgba(10,18,14,0.15)] ring-1 ring-schw-night/10"
                  />
                </div>
                <div>
                  <h3 className="font-display text-2xl font-bold">{b.titel}</h3>
                  <p className="mt-3 text-schw-night/80">{b.tekst}</p>
                  <ul className="mt-4 space-y-2">
                    {b.punten.map((p) => (
                      <li key={p} className="flex gap-2">
                        <span aria-hidden="true" className="font-bold text-schw-rust">
                          ✓
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-14 sm:px-8" aria-labelledby="ook">
        <h2 id="ook" className="font-display text-2xl font-bold">
          En verder
        </h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {OOK.map((o) => (
            <li key={o} className="rounded-2xl bg-white p-4 font-semibold shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
              {o}
            </li>
          ))}
        </ul>
        <div className="mt-10 rounded-xl3 bg-schw-night p-8 text-schw-cream sm:p-10">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Het beheer zelf eens zien?</h2>
          <p className="mt-3 max-w-2xl text-schw-cream/80">ZekerFlex laat het jullie graag zien, met een eigen inlog voor jullie team. Mail of bel ons.</p>
          <a href="mailto:info@zekerflex.com" className="mt-6 inline-block rounded-full bg-schw-orange px-6 py-3 font-bold text-schw-night">
            info@zekerflex.com
          </a>
        </div>
      </section>
    </>
  );
}
