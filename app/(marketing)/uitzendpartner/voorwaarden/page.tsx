import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";
import { PrintKnop } from "@/components/ui/PrintKnop";
import { canonical } from "@/lib/seo";
import { BASE_FEE_PER_HOUR_CENTS } from "@/lib/pricing/tiers";
import { PLATFORM_INSCHRIJVING, PLATFORM_NAAM } from "@/lib/platform/bedrijf";
import { AANSPRAKELIJKHEID_MAX_EURO, BOETE, PARTNER_VOORWAARDEN_DATUM, PARTNER_VOORWAARDEN_VERSIE, TERMIJN, euroBedrag } from "@/lib/uitzend/voorwaarden";

const title = "Partnervoorwaarden voor uitzendbureaus";
const description =
  "De regels voor uitzendbureaus op ZekerFlex: wie partner kan worden, wat het bureau als werkgever regelt, de kosten en wat er gebeurt bij een overtreding.";

export const metadata: Metadata = {
  title,
  description,
  ...canonical("/uitzendpartner/voorwaarden", { title, description }),
};

// De partnervoorwaarden (21 nov 2026). Bedragen en termijnen komen uit lib/uitzend/voorwaarden.ts, de platformvergoeding uit
// lib/pricing/tiers.ts. Een inhoudelijke wijziging = PARTNER_VOORWAARDEN_VERSIE ophogen. Laat een jurist meelezen voordat het
// eerste bureau tekent (zoals bij de andere juridische pagina's, lib/platform/bedrijf.ts).

const fee = `€ ${(BASE_FEE_PER_HOUR_CENTS / 100).toFixed(2).replace(".", ",")}`;
const T = TERMIJN;

const KORT = [
  `Jouw bureau is de werkgever van de uitzendkracht. ZekerFlex is geen werkgever, geen uitlener en geen uitzendbureau.`,
  `Je plaatst alleen echte klussen, met het juiste bruto uurloon volgens je cao.`,
  `Je reageert binnen ${T.reactieWerkdagen} werkdagen op elke aanvraag van een werker.`,
  `Je gebruikt de gegevens van werkers alleen voor hun aanvraag en hun contract.`,
  `Je betaalt het loon op tijd. ZekerFlex rekent ${fee} per gewerkt uur, te betalen binnen ${T.betaalDagen} dagen.`,
  `Bij een overtreding volgt eerst een waarschuwing, dan een schorsing, dan het einde van de samenwerking. Bij ernstige overtredingen direct, met een boete.`,
];

const BOETES: { wat: string; maatregel: string }[] = [
  {
    wat: "Een nepklus, of een klus met een misleidend loon of een misleidende omschrijving",
    maatregel: `De eerste keer een waarschuwing en de klus gaat offline. Bij herhaling binnen 12 maanden ${euroBedrag(BOETE.misleidendeKlus)} per klus.`,
  },
  {
    wat: `Vaker dan 3 keer per maand niet binnen ${T.reactieWerkdagen} werkdagen reageren op een aanvraag`,
    maatregel: `Een waarschuwing. Daarna ${T.schorsingDagen} dagen geen nieuwe klussen plaatsen.`,
  },
  {
    wat: "Een werker die je via ZekerFlex leerde kennen buiten ZekerFlex om inzetten (artikel 10)",
    maatregel: `De platformvergoeding over alle uren die de werker zo werkte. Zijn die niet vast te stellen: ${euroBedrag(BOETE.omzeilingPerWerker)} per werker.`,
  },
  {
    wat: "Loon aan een werker niet betalen, of meer dan 7 dagen te laat",
    maatregel: `Direct een schorsing en ${euroBedrag(BOETE.loonTeLaat)} per werker per keer. Bij herhaling het einde van de samenwerking.`,
  },
  {
    wat: "Gegevens van werkers misbruiken: doorverkopen, voor iets anders gebruiken of niet op tijd verwijderen",
    maatregel: `${euroBedrag(BOETE.gegevensMisbruik)} per overtreding en direct het einde van de samenwerking.`,
  },
  {
    wat: "Klussen plaatsen zonder geldige registratie of toelating als uitlener",
    maatregel: `${euroBedrag(BOETE.zonderToelating)} en direct het einde van de samenwerking.`,
  },
  {
    wat: "Discriminatie of grensoverschrijdend gedrag",
    maatregel: "Direct het einde van de samenwerking.",
  },
  {
    wat: `De factuur voor de platformvergoeding niet binnen ${T.betaalDagen} dagen betalen`,
    maatregel: "Wettelijke handelsrente en incassokosten (artikel 4.3 van de Gebruiksvoorwaarden). Na 30 dagen een schorsing.",
  },
];

export default function UitzendpartnerVoorwaardenPage() {
  return (
    <LegalPage
      title={title}
      updated={`${PARTNER_VOORWAARDEN_DATUM} (versie ${PARTNER_VOORWAARDEN_VERSIE})`}
      intro="Deze voorwaarden gelden voor uitzendbureaus die als uitzendpartner hun uitzendklussen op ZekerFlex plaatsen. Ze vullen de Gebruiksvoorwaarden van ZekerFlex aan. Staat er in deze voorwaarden iets anders, dan gaan deze voorwaarden voor."
      note={
        <>
          Vragen over deze voorwaarden, of akkoord geven? Mail{" "}
          <a href="mailto:uitzendbureau@zekerflex.com?subject=Partnervoorwaarden%20uitzendbureaus" className="text-brand-600 underline">
            uitzendbureau@zekerflex.com
          </a>
          . Zie ook de{" "}
          <Link href="/voorwaarden" className="text-brand-600 underline">
            Gebruiksvoorwaarden
          </Link>{" "}
          en de{" "}
          <Link href="/privacy" className="text-brand-600 underline">
            privacyverklaring
          </Link>
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
        <div className="mt-4 print:hidden">
          <PrintKnop />
          <span className="ml-3 text-xs text-neutralx-500">Kies bij afdrukken &ldquo;Opslaan als pdf&rdquo; voor een pdf.</span>
        </div>
      </div>

      <LegalSection
        heading="1. Begrippen"
        list={[
          `ZekerFlex: ${PLATFORM_NAAM}, ${PLATFORM_INSCHRIJVING}, die het platform ZekerFlex aanbiedt.`,
          "Uitzendpartner: het uitzendbureau dat met deze voorwaarden akkoord gaat en door ZekerFlex als uitzendpartner is geactiveerd.",
          "Werker: iemand met een account op ZekerFlex die op een uitzendklus van de uitzendpartner een uitzendcontract aanvraagt of werkt.",
          "Klant: het bedrijf waar de werker voor de uitzendpartner werkt (de inlener).",
          "Uitzendklus: een klus die de uitzendpartner op ZekerFlex plaatst.",
          "Aanvraag: een werker tikt bij een uitzendklus op \"Vraag uitzendcontract aan\".",
        ]}
      />

      <LegalSection
        heading="2. Wie wat doet"
        body="De uitzendpartner is de werkgever en de uitlener van de werker. De uitzendpartner sluit het uitzendcontract, betaalt het loon en draagt de loonheffingen en premies af. ZekerFlex is geen werkgever, geen uitlener en geen uitzendbureau. ZekerFlex laat de uitzendklussen zien aan werkers, controleert de identiteit van werkers met een ID-check, regelt het inchecken en de urenregistratie en stuurt de uitzendpartner de factuur voor de platformvergoeding."
      />

      <LegalSection
        heading="3. Wie uitzendpartner kan worden"
        body="ZekerFlex activeert een bureau pas als ZekerFlex het volgende heeft gecontroleerd. ZekerFlex mag er later opnieuw om vragen."
        list={[
          "Een inschrijving in het Handelsregister van de KVK, met het ter beschikking stellen van arbeidskrachten als activiteit.",
          "De registratie als uitlener bij de KVK. Zodra de Wet toelating terbeschikkingstelling arbeidskrachten (Wtta) geldt, ook de toelating volgens die wet.",
          "Een geldig SNA-keurmerk (NEN 4400-1). Een bureau zonder dat keurmerk kan alleen partner worden met een toelating volgens de Wtta.",
          "Een loonheffingennummer en het volgen van een uitzendcao (ABU of NBBU), met de pensioenregeling die daarbij hoort.",
          "Een bedrijfsaansprakelijkheidsverzekering.",
          "Een vaste contactpersoon en een e-mailadres waarop het bureau bereikbaar is.",
          "Akkoord met deze voorwaarden, per e-mail of in het platform.",
        ]}
      />
      <LegalSection
        body={`Vervalt een van deze punten, dan meldt de uitzendpartner dat binnen ${T.wijzigingWerkdagen} werkdagen aan ZekerFlex. Tot het weer in orde is, plaatst de uitzendpartner geen nieuwe klussen.`}
      />

      <LegalSection
        heading="4. Regels voor uitzendklussen"
        list={[
          "Alleen echte klussen. Een klus die alleen bedoeld is om gegevens van werkers te verzamelen, is niet toegestaan.",
          "Het bruto uurloon staat in de klus en volgt de cao. De uitzendpartner betaalt minstens dat loon.",
          "De werker krijgt minstens dezelfde beloning als een werknemer van de klant in dezelfde functie, zoals de Waadi voorschrijft.",
          "De omschrijving klopt: het werk, de plek, de tijden, de kleding en de certificaten die nodig zijn.",
          "De naam van de klant mag in de titel staan. Een klus mag niet de indruk wekken dat de klant zelf de werkgever is.",
          "Geen eisen die discrimineren, zoals in artikel 19 van de Gebruiksvoorwaarden.",
          "Een klus intrekken kan kosteloos tot de annuleringstermijn die bij de klus staat. Is er al een uitzendcontract, dan gelden daarna de cao en dat contract tegenover de werker.",
        ]}
      />

      <LegalSection
        heading="5. Aanvragen van werkers"
        list={[
          `De uitzendpartner reageert binnen ${T.reactieWerkdagen} werkdagen op elke aanvraag, met ja of nee, en houdt de stand bij in het platform.`,
          "Is het ja, dan sluit de uitzendpartner het uitzendcontract vóór de eerste werkdag.",
          "Wijst de uitzendpartner een werker af, dan gebeurt dat om redenen die met het werk te maken hebben.",
        ]}
      />

      <LegalSection
        heading="6. Gegevens van werkers en privacy"
        list={[
          "Bij een aanvraag geeft de werker toestemming om zijn naam, e-mailadres en telefoonnummer met de uitzendpartner te delen. Meer deelt ZekerFlex niet: geen BSN, geen kopie van een identiteitsbewijs.",
          "Vanaf dat moment is de uitzendpartner zelf verantwoordelijk voor die gegevens, volgens de AVG.",
          "De uitzendpartner gebruikt de gegevens alleen voor de aanvraag en het uitzendcontract. Doorverkopen of gebruiken voor iets anders is niet toegestaan.",
          `Komt er geen contract, dan verwijdert de uitzendpartner de gegevens binnen ${T.gegevensWeken} weken, tenzij de werker vraagt ze te bewaren.`,
          "De wettelijke identificatie bij indiensttreding en de controle of de werker in Nederland mag werken, doet de uitzendpartner zelf.",
          `Een datalek met gegevens van werkers meldt de uitzendpartner binnen ${T.datalekUren} uur aan ZekerFlex.`,
        ]}
      />

      <LegalSection
        heading="7. De uitzendpartner als werkgever"
        list={[
          "Het loon op tijd betalen, volgens de cao en het contract, met een loonstrook.",
          "Loonheffingen en premies afdragen, en vakantiegeld en pensioen regelen volgens de cao.",
          "Zorgen voor veilig werk samen met de klant: instructie, beschermingsmiddelen en de Arbeidstijdenwet.",
          "Ziekte en verzuim: de werker meldt zich ziek bij de uitzendpartner.",
          "De uitzendpartner is tegenover de klant verantwoordelijk voor de werker.",
        ]}
      />

      <LegalSection
        heading="8. Uren en goedkeuring"
        body={`De werker checkt in via ZekerFlex en vult daar zijn uren in. De uitzendpartner, of de klant namens de uitzendpartner, keurt de uren binnen ${T.urenDagen} dagen goed of doet een tegenvoorstel. Daarna gelden de ingevulde uren als definitief. ZekerFlex verloont niet: de goedgekeurde uren zijn de basis voor de verloning door de uitzendpartner.`}
      />

      <LegalSection
        heading="9. Kosten en betaling"
        list={[
          `De platformvergoeding is ${fee} exclusief btw per gewerkt en goedgekeurd uur, met de staffelkorting op de pagina Prijzen.`,
          "Geen abonnement, geen inschrijfkosten en geen plaatsingskosten.",
          `ZekerFlex stuurt de factuur na de goedkeuring van de uren. De uitzendpartner betaalt binnen ${T.betaalDagen} dagen na de factuurdatum.`,
          "Bij te laat betalen gelden de wettelijke handelsrente en de incassokosten uit artikel 4.3 van de Gebruiksvoorwaarden.",
        ]}
      />

      <LegalSection
        heading="10. Buiten ZekerFlex om"
        body={`Zet de uitzendpartner binnen ${T.omzeilingMaanden} maanden na de eerste aanvraag een werker die hij via ZekerFlex leerde kennen in op werk dat niet via ZekerFlex loopt, dan betaalt de uitzendpartner de platformvergoeding over die uren. Zijn de uren niet vast te stellen, dan betaalt de uitzendpartner ${euroBedrag(BOETE.omzeilingPerWerker)} per werker. Werkers die de uitzendpartner al kende vóór hun eerste aanvraag op ZekerFlex, vallen hier niet onder.`}
      />

      <div>
        <h2 className="font-display text-lg font-semibold text-ink">11. Boetes</h2>
        <p className="mt-1.5">
          Een boete is direct opeisbaar. Een boete laat het recht van ZekerFlex op nakoming en op vergoeding van de werkelijke schade
          onverlet, voor zover die schade hoger is dan de boete.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-hair">
                <th scope="col" className="py-2 pr-4 font-semibold text-ink">
                  Overtreding
                </th>
                <th scope="col" className="py-2 font-semibold text-ink">
                  Gevolg
                </th>
              </tr>
            </thead>
            <tbody>
              {BOETES.map((b) => (
                <tr key={b.wat} className="border-b border-hair align-top">
                  <td className="py-2 pr-4">{b.wat}</td>
                  <td className="py-2">{b.maatregel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <LegalSection
        heading="12. Zo handhaaft ZekerFlex"
        list={[
          `Stap 1, waarschuwing: per e-mail, met wat er mis is en ${T.herstelWerkdagen} werkdagen om het te herstellen.`,
          "Stap 2, schorsing: de uitzendpartner kan tijdelijk geen nieuwe klussen plaatsen. Lopende klussen gaan door, in het belang van de werkers.",
          "Stap 3, einde van de samenwerking: het account is geen uitzendpartner meer en de klussen gaan offline.",
          "Bij een ernstige overtreding (zie de tabel in artikel 11) mag ZekerFlex een stap overslaan en direct schorsen of de samenwerking beëindigen.",
          `Bezwaar: binnen ${T.bezwaarDagen} dagen na de maatregel per e-mail aan uitzendbureau@zekerflex.com. ZekerFlex beslist binnen ${T.beslisWerkdagen} werkdagen.`,
        ]}
      />

      <LegalSection
        heading="13. Bescherming van werkers"
        body="Een schorsing of het einde van de samenwerking verandert niets aan de plichten van de uitzendpartner tegenover werkers met wie al een contract is gesloten: het loon blijft verschuldigd. ZekerFlex mag die werkers en de klanten informeren en werkers helpen aan ander werk via het platform."
      />

      <LegalSection
        heading="14. Aansprakelijkheid"
        body={`ZekerFlex is niet aansprakelijk voor het loon, de loonheffingen, de premies of de pensioenen van werkers, niet voor boetes of naheffingen van de overheid, en niet voor schade die een werker veroorzaakt. De uitzendpartner vrijwaart ZekerFlex voor aanspraken van werkers, klanten en overheden die voortkomen uit het werkgeverschap of het uitlenen. Elke aansprakelijkheid van ZekerFlex is beperkt tot de platformvergoeding die de uitzendpartner in de 12 maanden vóór de gebeurtenis betaalde, en tot ten hoogste ${euroBedrag(AANSPRAKELIJKHEID_MAX_EURO)} per kalenderjaar. Aansprakelijkheid voor indirecte schade, gevolgschade en gederfde winst is uitgesloten.`}
      />

      <LegalSection
        heading="15. Duur en opzeggen"
        body={`De samenwerking geldt voor onbepaalde tijd. De uitzendpartner kan per e-mail opzeggen met een termijn van ${T.opzegMaanden} maand; lopende klussen worden afgemaakt. ZekerFlex kan opzeggen met dezelfde termijn, en zonder termijn bij een ernstige overtreding (artikel 12).`}
      />

      <LegalSection
        heading="16. Wijzigingen"
        body={`ZekerFlex mag deze voorwaarden wijzigen en meldt een wijziging minstens ${T.wijzigingVoorwaardenDagen} dagen vooraf per e-mail. Is een wijziging nadelig voor de uitzendpartner, dan mag die opzeggen tegen de dag dat de wijziging ingaat. Bij een nieuwe versie vraagt ZekerFlex opnieuw om akkoord.`}
      />

      <LegalSection
        heading="17. Toepasselijk recht"
        body="Op deze voorwaarden is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in het arrondissement Amsterdam, zoals in de Gebruiksvoorwaarden."
      />
    </LegalPage>
  );
}
