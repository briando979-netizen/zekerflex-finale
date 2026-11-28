import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";
import { canonical } from "@/lib/seo";
import { BASE_FEE_PER_HOUR_CENTS } from "@/lib/pricing/tiers";
import { PLATFORM_INSCHRIJVING, PLATFORM_NAAM } from "@/lib/platform/bedrijf";
import { BELGIE_BRONNEN } from "@/lib/belgie/klus-kern";

const title = "Bemiddelingsvoorwaarden voor België";
const description =
  "Hoe ZekerFlex in Vlaanderen bemiddelt: werkers betalen nooit, het bedrijf kiest zelf en is de werkgever, je krijgt bericht over de keuze en een kopie van je dossier.";

export const metadata: Metadata = {
  title,
  description,
  ...canonical("/belgie/voorwaarden", { title, description }),
};

// De rechten en plichten van werkers en bedrijven bij een klus in België (28 nov 2026, spec-belgie.md hoofdstuk 3: de algemene
// voorwaarden voor private arbeidsbemiddeling van het Vlaamse decreet van 10 december 2010). Alleen wat de app nu echt doet;
// een inhoudelijke wijziging = de versie en de datum hieronder ophogen. Laat een Belgische jurist meelezen voor de eerste klus.

const VERSIE = "1";
const DATUM = "28 november 2026";
const fee = `€ ${(BASE_FEE_PER_HOUR_CENTS / 100).toFixed(2).replace(".", ",")}`;

const KORT = [
  "Werkers betalen ZekerFlex nooit iets: geen inschrijfgeld, geen abonnement, geen kosten per klus en geen boete bij afzeggen.",
  "Het bedrijf kiest zelf wie er werkt en is de werkgever. ZekerFlex beslist niet in de plaats van het bedrijf over aanwerven of ontslaan.",
  "Wie reageert, krijgt bericht over de keuze van het bedrijf, ook als hij of zij niet gekozen is.",
  "Je kunt je eigen dossier inzien en er een kopie van krijgen.",
  "ZekerFlex vraagt en bewaart nooit je rijksregisternummer.",
];

export default function BelgieVoorwaardenPage() {
  return (
    <LegalPage
      title={title}
      updated={`${DATUM} (versie ${VERSIE})`}
      intro="Deze voorwaarden gelden voor klussen op een werklocatie in Vlaanderen. Ze beschrijven de rechten en plichten van werkers en bedrijven als ZekerFlex hen samenbrengt, volgens de regels voor private arbeidsbemiddeling van de Vlaamse overheid (het decreet van 10 december 2010). Ze vullen de Gebruiksvoorwaarden van ZekerFlex aan."
      note={
        <>
          Vragen of een klacht? Mail{" "}
          <a href="mailto:info@zekerflex.com?subject=Bemiddeling%20in%20Belgi%C3%AB" className="text-brand-600 underline">
            info@zekerflex.com
          </a>
          . Over je gegevens:{" "}
          <a href="mailto:privacy@zekerflex.com" className="text-brand-600 underline">
            privacy@zekerflex.com
          </a>
          . Zie ook de{" "}
          <Link href="/voorwaarden" className="text-brand-600 underline">
            Gebruiksvoorwaarden
          </Link>
          , de{" "}
          <Link href="/privacy" className="text-brand-600 underline">
            privacyverklaring
          </Link>{" "}
          en de uitleg van de{" "}
          <a href={BELGIE_BRONNEN.bemiddeling} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">
            Vlaamse overheid over private arbeidsbemiddeling
          </a>
          .
        </>
      }
    >
      <div className="rounded-2xl border border-hair bg-paper-soft p-5">
        <h2 className="font-display text-lg font-semibold text-ink">In het kort</h2>
        <ul className="mt-2 space-y-1.5">
          {KORT.map((k) => (
            <li key={k} className="flex gap-2.5">
              <span className="mt-0.5 flex-shrink-0 text-brand-mint">·</span>
              <span>{k}</span>
            </li>
          ))}
        </ul>
      </div>

      <LegalSection
        heading="1. Wie doet wat"
        list={[
          `ZekerFlex (${PLATFORM_NAAM}, ${PLATFORM_INSCHRIJVING}) bemiddelt: het brengt bedrijven en werkers samen via de app. In België is ZekerFlex geen werkgever en geen uitzendbureau, en het stelt geen werkers ter beschikking van een bedrijf.`,
          "Het bedrijf is de werkgever. Bij een student sluit het een studentenovereenkomst en doet het de Dimona van het type STU. Bij een flexi-job sluit het een raamovereenkomst en een flexi-arbeidsovereenkomst en doet het de Dimona van het type FLX. Het bedrijf betaalt het loon en regelt de loonadministratie, zelf of via zijn sociaal secretariaat.",
          "De werker beslist zelf op welke klus hij of zij reageert, en mag altijd ook voor anderen werken.",
          "Werken via een erkend Belgisch uitzendbureau en werken als zelfstandige kan via ZekerFlex nog niet. Ook Wallonië en Brussel volgen later, met eigen voorwaarden.",
        ]}
      />

      <LegalSection
        heading="2. Rechten van werkers"
        list={[
          "Gratis: ZekerFlex vraagt een werker nooit een vergoeding, voor niets.",
          "Juiste informatie: op elke klus staan het werk, de plaats, de tijden, het uurloon en het soort contract. Een klus die niet bestaat of misleidt, mag niet: meld hem via info@zekerflex.com, dan haalt ZekerFlex hem weg.",
          "Bericht over de keuze: wijst het bedrijf je af, dan hoor je dat in de app, met een bericht in de chat en een melding. Begint de klus zonder dat het bedrijf je koos, dan staat de klus in Mijn klussen als niet gekozen, met een melding als je meldingen aan hebt.",
          "Bewijs van je reactie: op verzoek krijg je een bewijs dat je op een klus reageerde, met de datum en het uur. Mail daarvoor info@zekerflex.com.",
          "Inzage en een kopie van je dossier: in de app via Account → Download mijn gegevens, of via privacy@zekerflex.com. Je krijgt de kopie binnen een maand.",
          "Privacy: ZekerFlex gebruikt je gegevens alleen voor de bemiddeling. Het bedrijf waarop je reageert, krijgt alleen wat het voor de klus en het contract nodig heeft. Je rijksregisternummer vraagt of bewaart ZekerFlex nooit: dat geef je alleen aan je werkgever voor de Dimona.",
          "Taal: in Vlaanderen bemiddelt ZekerFlex in het Nederlands. De app is er ook in andere talen, als hulp; bij verschil geldt de Nederlandse tekst.",
        ]}
      />

      <LegalSection
        heading="3. Plichten van werkers"
        list={[
          "Je geeft juiste gegevens over jezelf.",
          "Werk je als student, dan geef je het bedrijf je inschrijvingsattest en de code van je attest uit Student@work, zodat het bedrijf je urenpakket kan nakijken.",
          "Werk je met een flexi-job, dan voldoe je aan de voorwaarden: in het derde kwartaal ervoor werkte je minstens 4/5 bij een andere werkgever, of je bent gepensioneerd. Verandert dat, dan zeg je het meteen tegen het bedrijf.",
          "Kun je onverhoopt niet, dan laat je het het bedrijf op tijd weten.",
        ]}
      />

      <LegalSection
        heading="4. Rechten van bedrijven"
        list={[
          "Het bedrijf kiest zelf wie er werkt. Op een klus in België plant ZekerFlex niemand automatisch in en geeft het geen plek aan wie het eerst reageert.",
          "Het bedrijf krijgt in de app een checklist en contractsjablonen met de gegevens van de klus al ingevuld. Dat is hulp, geen juridisch advies: laat de sjablonen nakijken door je sociaal secretariaat voordat je tekent.",
        ]}
      />

      <LegalSection
        heading="5. Plichten van bedrijven"
        list={[
          "Het bedrijf plaatst alleen echte klussen, met juiste informatie over het werk, de plaats, de tijden, het uurloon en het soort contract.",
          "Het bedrijf is de werkgever: het sluit het contract, doet de Dimona vóór de start, betaalt minstens het minimumloon of het sectorbarema, en zorgt voor welzijn op het werk en de verzekering tegen arbeidsongevallen.",
          "Het bedrijf bevestigt in de app dat het de werkgever is en de Dimona doet, voordat het iemand kiest.",
          "Het bedrijf geeft elke kandidaat een antwoord: het kiest of wijst af in de app, zodat de werker bericht krijgt.",
          "Het bedrijf gebruikt de gegevens van werkers alleen voor de klus en het contract.",
          "Een werker van buiten de Europese Economische Ruimte zet het bedrijf alleen in met de toelating die daarvoor nodig is.",
          `ZekerFlex rekent het bedrijf ${fee} per gewerkt uur als platformkosten. Een Belgisch bedrijf met een btw-nummer krijgt de factuur zonder btw, met de vermelding dat de btw verlegd is.`,
        ]}
      />
    </LegalPage>
  );
}
