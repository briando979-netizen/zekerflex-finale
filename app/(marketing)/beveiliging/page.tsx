import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import { zichtbareSecties } from "@/lib/ontwerp/vaste-paginas";
import { getPaginaIndeling } from "@/lib/ontwerp/vaste-paginas-store";
import Link from "next/link";
import { CtaBand, Section, SectionHead, Stat } from "@/components/marketing/primitives";
import { beveiligingsCijfers } from "@/lib/ops/crowdsec";
import { breadcrumbJsonLd, canonical, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { amsterdamClock } from "@/lib/time/amsterdam";

// De cijfers van de aanvalsbescherming verversen elke 10 minuten; de rest is vaste tekst.
// Zonder revalidate zou Next deze pagina bij de build vastzetten, zonder cijfers (AGENTS.md).
export const revalidate = 600;

const TITEL = "Beveiliging en eigen servers";
const OMSCHRIJVING =
  "ZekerFlex draait op een eigen server in Nederland. Lees hoe we de site en jouw gegevens beschermen: automatische aanvalsbescherming, versleuteling, dagelijkse back-ups en wat we loggen.";

export const metadata: Metadata = {
  title: { absolute: `${TITEL} | ZekerFlex` },
  description: OMSCHRIJVING,
  keywords: ["beveiliging zekerflex", "eigen server nederland", "aanvalsbescherming", "avg flexwerk platform", "veilig uitzendplatform"],
  ...canonical("/beveiliging", { title: TITEL, description: OMSCHRIJVING }),
};

const PIJLERS: { kop: string; tekst: string }[] = [
  {
    kop: "Eigen server in Nederland",
    tekst:
      "ZekerFlex draait niet bij een Amerikaanse cloud, maar op een eigen server in een Nederlands datacenter. Eén partij heeft toegang tot de machine: wij. De database, de bestanden en de back-ups blijven in Nederland.",
  },
  {
    kop: "Versleutelde verbinding, altijd",
    tekst:
      "Alles loopt over https met certificaten die automatisch vernieuwd worden. Ook de websites die we voor klanten bouwen krijgen hun eigen certificaat; een onversleutelde pagina bestaat bij ons niet.",
  },
  {
    kop: "Automatische aanvalsbescherming",
    tekst:
      "Een beschermingslaag (CrowdSec, open source) leest de serverlogs mee en herkent scanners, inbraakpogingen en programma's die wachtwoorden raden. Zo'n adres wordt op de firewall geblokkeerd, binnen seconden en zonder dat jij er iets van merkt. Adressen die wereldwijd al als aanvaller bekendstaan, komen er niet eens in.",
  },
  {
    kop: "Beheer alleen met sleutels",
    tekst:
      "De server accepteert geen wachtwoorden voor beheertoegang, alleen cryptografische sleutels. De firewall staat standaard dicht; alleen de poorten voor de website en het bellen staan open.",
  },
  {
    kop: "Elke wijziging gecontroleerd vóór hij live gaat",
    tekst:
      "Nieuwe code wordt eerst gebouwd en gecontroleerd. Pas als de nieuwe versie zich gezond meldt, krijgt hij verkeer; zo niet, dan zet de server de vorige versie automatisch terug. Database-wijzigingen worden eerst proefgedraaid en weer teruggedraaid.",
  },
  {
    kop: "Dagelijkse back-up met proef-terugzetting",
    tekst:
      "Elke nacht maken we een back-up van de database en de bestanden en bewaren die veertien dagen. Elke back-up wordt direct proef-teruggezet in een losse database, zodat we zeker weten dat hij werkt op de dag dat we hem nodig hebben.",
  },
  {
    kop: "Tweestapsverificatie en inlogbescherming",
    tekst:
      "Iedereen kan tweestapsverificatie aanzetten; voor beheerders houden we bij of het aanstaat. Wie te vaak een verkeerd wachtwoord probeert, wordt vertraagd en krijgt een controle. Wachtwoorden slaan we alleen versleuteld op.",
  },
  {
    kop: "Geen trackers, geen cookies van anderen",
    tekst:
      "Bezoekerscijfers tellen we zelf op de server, zonder cookies en zonder scripts van advertentienetwerken. De websites die we voor klanten bouwen laden niets van derden: geen lettertypes, geen kaarten, geen trackers.",
  },
  {
    kop: "Een logboek dat niet te vervalsen is",
    tekst:
      "Belangrijke handelingen (uren goedkeuren, facturen, uitbetalingen, wijzigingen door beheerders) staan in een auditspoor waarvan elke regel aan de vorige vastzit. Een regel achteraf aanpassen of weghalen valt meteen op.",
  },
];

const LOGS: { wat: string; waarom: string; hoelang: string }[] = [
  {
    wat: "Toegangslog van de webserver: IP-adres, tijdstip, opgevraagde pagina en browsersoort",
    waarom: "Scanners, inbraakpogingen en overbelasting herkennen en blokkeren. Zonder cookies, zonder wachtwoorden of sleutels uit links.",
    hoelang: "7 dagen",
  },
  {
    wat: "Inlogpogingen per adres en per account",
    waarom: "Wachtwoorden raden afremmen en melden.",
    hoelang: "Kort: hooguit enkele uren",
  },
  {
    wat: "Foutmeldingen van het platform",
    waarom: "Storingen zien en oplossen voordat jij ze meldt.",
    hoelang: "Tot ze zijn opgelost",
  },
  {
    wat: "Auditspoor van handelingen in je account",
    waarom: "Wettelijke bewaarplicht en bewijs bij een geschil.",
    hoelang: "Zolang je account bestaat, en daarna zo lang de wet vraagt",
  },
  {
    wat: "Back-ups van de database en bestanden",
    waarom: "Herstel na een storing of fout.",
    hoelang: "14 dagen",
  },
];

export default async function BeveiligingPagina() {
  const cijfers = await beveiligingsCijfers().catch(() => null);
  const pagina = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: TITEL,
    description: OMSCHRIJVING,
    url: `${SITE.url}/beveiliging`,
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
  };

  // de onderdelen onder de kop: volgorde en zichtbaarheid uit de Site-ontwerper (Pagina's); zonder eigen indeling exact de standaard
  const onderdelen: Record<string, ReactNode> = {
    cijfers: (
      <Section tone="soft" id="cijfers">
        <SectionHead
          eyebrow="Live"
          title="Wat de bescherming op dit moment tegenhoudt"
          intro={
            cijfers
              ? `Echte cijfers van onze server, bijgewerkt om ${amsterdamClock(cijfers.bijgewerkt)} en elke tien minuten opnieuw.`
              : "De cijfers verschijnen hier zodra de bescherming op deze omgeving actief is."
          }
        />
        {cijfers && (
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            <Stat value={cijfers.blokkadesNu.toLocaleString("nl-NL")} label="adressen krijgen nu geen antwoord van onze server" />
            <Stat value={cijfers.community.toLocaleString("nl-NL")} label="bekende aanvallers geweerd via de gedeelde blokkadelijst" />
            <Stat
              value={cijfers.meldingen7d === null ? cijfers.eigen.toLocaleString("nl-NL") : cijfers.meldingen7d.toLocaleString("nl-NL")}
              label={cijfers.meldingen7d === null ? "adressen door onze eigen logs geblokkeerd" : "aanvalspogingen in de afgelopen 7 dagen zelf herkend en gestopt"}
            />
          </div>
        )}
        <p className="mt-8 max-w-2xl text-sm text-neutralx-500">
          Deze bescherming deelt met het open CrowdSec-netwerk welke adressen bij ons aanvallen (alleen het IP-adres en het soort aanval),
          en krijgt daar de adressen voor terug die elders al zijn betrapt. Bezoekers, klanten en flexwerkers komen daar nooit in voor.
        </p>
      </Section>
    ),
    maatregelen: (
      <Section tone="paper" id="zo-beveiligd">
        <SectionHead eyebrow="Zo is ZekerFlex beveiligd" title="Negen dingen die standaard geregeld zijn" />
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PIJLERS.map((p) => (
            <div key={p.kop} className="card p-6">
              <h3 className="font-display text-lg font-semibold text-ink">{p.kop}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{p.tekst}</p>
            </div>
          ))}
        </div>
      </Section>
    ),
    logboek: (
      <Section tone="soft" id="logboek">
        <SectionHead
          eyebrow="Open kaart"
          title="Wat we loggen, en hoe lang"
          intro="Beveiliging kan niet zonder logboeken. Dit houden we bij, waarom, en wanneer het weer weg is."
        />
        <div className="mt-10 overflow-hidden rounded-2xl border border-hair bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-soft text-xs uppercase tracking-wide text-neutralx-500">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Wat
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Waarom
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Hoe lang
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {LOGS.map((l) => (
                <tr key={l.wat} className="align-top">
                  <td className="px-5 py-4 font-medium text-ink">{l.wat}</td>
                  <td className="px-5 py-4 text-neutralx-600">{l.waarom}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-neutralx-600">{l.hoelang}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 max-w-2xl text-sm text-neutralx-500">
          Wat we verder van je verwerken en waarom staat in het{" "}
          <Link href="/privacy" className="font-medium text-brand-600 underline">
            privacybeleid
          </Link>
          . Je gegevens opvragen of laten wissen kan vanuit je account.
        </p>
      </Section>
    ),
    melden: (
      <Section tone="paper" id="melden">
        <SectionHead
          eyebrow="Iets gevonden?"
          title="Meld een kwetsbaarheid"
          intro="Zie je iets wat niet klopt of wat je zorgen baart, laat het ons weten. We nemen elke melding serieus, reageren snel en vallen je niet lastig als je te goeder trouw handelt."
        />
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/contact" className="btn-primary">
            Melding doorgeven
          </Link>
          <Link href="/verwerkersovereenkomst" className="btn-ghost">
            Verwerkersovereenkomst
          </Link>
        </div>
      </Section>
    ),
    slot: (
      <CtaBand
        title="Zo veilig is ook jouw website bij ZekerFlex"
        body="Elke website die we voor een klant bouwen draait op dezelfde server, achter dezelfde bescherming, zonder scripts van derden."
        primaryHref="/aanbod/website"
        primaryLabel="Website laten maken"
        secondaryHref="/aanbod"
        secondaryLabel="Het hele aanbod"
      />
    ),
  };
  const zichtbaar = zichtbareSecties("beveiliging", await getPaginaIndeling("beveiliging"));
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson([pagina, breadcrumbJsonLd([["Home", "/"], [TITEL, "/beveiliging"]])]) }}
      />

      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">Beveiliging &amp; eigen servers</p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-tight md:text-6xl">
            Jouw gegevens staan op onze eigen server in Nederland
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-white/70">
            Geen Amerikaanse cloud, geen tussenpartijen. Hieronder lees je precies hoe we de site beschermen, wat we loggen en wat er
            gebeurt als iemand probeert in te breken.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/privacy" className="btn-mint">
              Privacybeleid
            </Link>
            <Link href="/status" className="btn-ghost-invert">
              Systeemstatus
            </Link>
          </div>
        </div>
      </div>

      {zichtbaar.map((id) => (
        <Fragment key={id}>{onderdelen[id]}</Fragment>
      ))}
    </>
  );
}
