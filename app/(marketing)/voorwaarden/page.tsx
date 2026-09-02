import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";

export const metadata: Metadata = { title: "Gebruiksvoorwaarden" };

export default function VoorwaardenPage() {
  return (
    <LegalPage
      title="Gebruiksvoorwaarden"
      updated="1 mei 2026"
      intro="ZekerFlex B.V. (ZekerFlex), gevestigd te Amsterdam en ingeschreven bij de Kamer van Koophandel. Deze gebruiksvoorwaarden regelen het gebruik van het ZekerFlex-platform door opdrachtgevers en opdrachtnemers."
      note={
        <>
          Vragen over deze voorwaarden? Mail{" "}
          <a href="mailto:voorwaarden@zekerflex.com" className="text-brand-600 underline">
            voorwaarden@zekerflex.com
          </a>
          .
        </>
      }
    >
      <LegalSection
        heading="1. Definities"
        list={[
          "Diensten – alle met het gebruik van het Platform samenhangende diensten die ZekerFlex aanbiedt.",
          "Gebruiksvoorwaarden – deze voorwaarden, die het gebruik van het Platform en de Diensten regelen.",
          "Opdracht – de opdracht zoals omschreven in de door de Opdrachtgever op het Platform geplaatste dienst.",
          "Opdrachtgever – de rechtspersoon die via het Platform een Opdracht aanbiedt.",
          "Opdrachtnemer – de natuurlijke persoon die zich via het Platform beschikbaar stelt voor het uitvoeren van een Opdracht.",
          "Overeenkomst – de overeenkomst van opdracht (art. 7:400 BW) tussen Opdrachtnemer en Opdrachtgever. ZekerFlex stelt een modelovereenkomst ter beschikking die als basis kan worden gebruikt.",
          "Platform – zekerflex.com en alles wat daaraan gelieerd is, inclusief de bijbehorende app(s).",
        ]}
      />
      <LegalSection
        heading="2. Algemeen"
        body="ZekerFlex is een technologisch platform dat fungeert als elektronische marktplaats waar Opdrachtgevers kortdurende Opdrachten van maximaal één dag plaatsen en waar Opdrachtnemers op reageren. Opdrachtnemers bepalen zelf of zij reageren en onderhandelen zelf over de voorwaarden. ZekerFlex is geen partij bij de Overeenkomst en draagt geen verantwoordelijkheid voor de inhoud of de uitvoering ervan. Deze Gebruiksvoorwaarden zijn van toepassing op elk gebruik van het Platform en vervangen eerder gemaakte afspraken hierover; de toepasselijkheid van eigen algemene voorwaarden van Opdrachtgever of Opdrachtnemer wordt afgewezen. Afwijkingen gelden alleen als ZekerFlex die schriftelijk of per e-mail heeft bevestigd. De Opdrachtgever is wettelijk verplicht om vóór aanvang van de Opdracht de identiteit van de Opdrachtnemer en het recht om in Nederland te werken te controleren en, voor zover vereist, kopieën te bewaren."
      />
      <LegalSection
        heading="3. Registratie"
        body="Om het Platform te gebruiken maak je een account aan via de registratieprocedure. Gegevens worden volledig en naar waarheid verstrekt en gehouden. Het account en wachtwoord zijn strikt persoonlijk en mogen niet met derden worden gedeeld; delen leidt tot uitsluiting en annulering van Opdrachten. Je bent volledig verantwoordelijk voor alles wat via je account gebeurt en vrijwaart ZekerFlex voor schade die daaruit ontstaat. Meld direct bij ZekerFlex als je vermoedt dat een derde je wachtwoord kent of je account gebruikt."
      />
      <LegalSection
        heading="3.1 Vereisten voor Opdrachtgevers"
        list={[
          "een geldige inschrijving bij de Kamer van Koophandel;",
          "volledige en correcte contact- en facturatiegegevens;",
          "een geldig rekeningnummer op naam van de Opdrachtgever;",
          "een werkende zakelijke website.",
        ]}
      />
      <LegalSection
        heading="3.2 Vereisten voor Opdrachtnemers"
        list={[
          "een btw-identificatienummer en/of een geldige KvK-inschrijving;",
          "contact- en facturatiegegevens;",
          "een geldig Nederlands bankrekeningnummer;",
          "een profielfoto waaruit de identiteit duidelijk blijkt;",
          "een geldig identiteitsbewijs waaruit blijkt dat de Opdrachtnemer in Nederland mag werken.",
        ]}
      />
      <LegalSection
        heading="4. Facturatie en betaling"
        body="ZekerFlex treedt op als kassier: ZekerFlex factureert namens de Opdrachtnemer aan de Opdrachtgever en zet de ontvangen betaling door aan de Opdrachtnemer (reverse billing). De Opdrachtnemer verleent ZekerFlex hiervoor een onherroepelijke volmacht. Zodra de Opdrachtgever de gewerkte uren via het Platform bevestigt, wordt automatisch een factuur gegenereerd. De Opdrachtgever betaalt de factuur voor de platformvergoeding binnen veertien (14) dagen na factuurdatum. De Opdrachtnemer betaalt niets voor het gebruik van het Platform. Betaling door de Opdrachtgever aan ZekerFlex geldt als bevrijdende betaling richting de Opdrachtnemer; ZekerFlex is niet aansprakelijk voor betalingen tussen partijen, behoudens reeds door ZekerFlex ontvangen gelden."
      />
      <LegalSection
        heading="4.1 Uitbetaalkeuze en factoring"
        body="De Opdrachtnemer kiest per Opdracht wanneer die wordt uitbetaald. Wachten tot de Opdrachtgever betaalt (binnen dertig dagen) is kosteloos; in dat geval blijft het debiteurenrisico bij de Opdrachtnemer. Kiest de Opdrachtnemer voor een snellere uitbetaling, dan verkoopt en cedeert die de vordering aan ZekerFlex tegen een koopprijs gelijk aan het factuurbedrag minus een vergoeding:"
        list={[
          "2% van het factuurbedrag bij uitbetaling binnen drie (3) werkdagen na goedkeuring van de uren;",
          "4% van het factuurbedrag bij uitbetaling direct bij goedkeuring van de uren.",
        ]}
      />
      <LegalSection
        heading="4.2 Akte van koop en cessie"
        body="Voor elke factoringtransactie sluiten ZekerFlex en de Opdrachtnemer een akte van koop en cessie. Bij de eerste keer machtigt de Opdrachtnemer ZekerFlex om die akten namens de Opdrachtnemer te ondertekenen met een elektronische handtekening; partijen komen overeen dat authenticatie via een per sms toegezonden verificatiecode op het opgegeven mobiele nummer voldoende betrouwbaar is (art. 3:15a BW). Na mededeling van de cessie kan de Opdrachtgever uitsluitend bevrijdend betalen aan ZekerFlex. Moet een gekochte vordering (deels) worden terugbetaald, dan doet de Opdrachtnemer dat binnen twee (2) werkdagen na bericht. ZekerFlex mag betalingen tijdelijk blokkeren voor controle (bijvoorbeeld bij vermoedelijke fraude) en spant zich in zo'n blokkade binnen drie (3) werkdagen op te heffen."
      />
      <LegalSection
        heading="4.3 Incassokosten"
        body="Alle kosten van (buiten)gerechtelijke inning van openstaande vorderingen komen voor rekening van de Opdrachtgever. De vergoeding voor buitengerechtelijke incassokosten bedraagt ten minste 15% van de hoofdsom exclusief wettelijke rente, met een minimum van € 250,– per vordering, verschuldigd zodra de vordering ter incasso uit handen wordt gegeven. Zijn de werkelijke kosten hoger, dan mogen die integraal in rekening worden gebracht."
      />
      <LegalSection
        heading="4.4 Facturatiemoment platformvergoeding"
        body="De factuur voor de platformvergoeding wordt opgesteld op het eerstvolgende facturatiemoment. De Opdrachtgever kiest tussen wekelijkse facturatie op vrijdag of tweewekelijkse facturatie op dinsdag en vrijdag."
      />
      <LegalSection
        heading="5. Vergoeding en uren"
        body="De Opdrachtnemer ontvangt een vooraf overeengekomen vergoeding per uur, exclusief btw en overheidsheffingen. De Opdrachtnemer voert de gewerkte uren binnen zeven (7) dagen na afronding in via het Platform. De Opdrachtgever bevestigt de uren binnen zeven (7) dagen; gebeurt dat niet, dan gelden de ingevoerde uren als definitief. Zijn de uren onjuist, dan kan de Opdrachtgever via het Platform een tegenvoorstel doen; accepteert de Opdrachtnemer dat niet binnen vier (4) weken, dan geldt het tegenvoorstel als geaccepteerd. Keurt de Opdrachtgever te veel ingevoerde uren goed, dan is die gehouden die uren te betalen."
      />
      <LegalSection
        heading="5.1 Platformvergoeding"
        body="Voor het beschikbaar stellen van het Platform is de Opdrachtgever aan ZekerFlex een platformvergoeding verschuldigd van € 3,50 exclusief btw per door de Opdrachtnemer gewerkt uur, tenzij schriftelijk anders overeengekomen. De Opdrachtnemer betaalt niets voor het gebruik van het Platform."
      />
      <LegalSection
        heading="6. Aansprakelijkheid"
        body="ZekerFlex heeft geen invloed op de keuze van een Opdrachtnemer of op de inhoud en voorwaarden van de Overeenkomst en aanvaardt daarvoor geen aansprakelijkheid. ZekerFlex is niet aansprakelijk voor content van derden op het Platform, noch voor schade die direct of indirect samenhangt met de totstandkoming, uitvoering of beëindiging van de Opdracht. ZekerFlex is niet verantwoordelijk voor de belastingaangiften van Opdrachtnemers, voor betalingen tussen partijen onderling, voor de identiteitscontrole van Opdrachtnemers, voor nakoming van de Overeenkomst, of voor activiteiten op het account van een gebruiker. Opdrachtgever en Opdrachtnemer vrijwaren ZekerFlex voor aanspraken van derden. Elke aansprakelijkheid van ZekerFlex is beperkt tot € 1.000,– per gebeurtenis en € 5.000,– per kalenderjaar; aansprakelijkheid voor indirecte schade, gevolgschade, gederfde winst en gemiste besparingen is uitgesloten."
      />
      <LegalSection
        heading="7. Verzekering"
        body="ZekerFlex biedt als aanvullende dienst dat de Opdrachtnemer voor elke Opdracht is verzekerd voor aansprakelijkheid en ongevallen via onze verzekeringspartner. De voorwaarden, dekkingen en uitsluitingen staan in de polisdocumenten die via je account bij de verzekeringspartner beschikbaar zijn. Het staat de Opdrachtnemer vrij zelf aanvullende verzekeringen af te sluiten."
      />
      <LegalSection
        heading="8. Beëindiging registratie"
        body="Opdrachtnemer en Opdrachtgever kunnen hun registratie op elk moment en zonder opgaaf van reden beëindigen, mits lopende verplichtingen uit reeds aangegane Opdrachten worden nagekomen. ZekerFlex mag een registratie beëindigen bij een gegronde reden, waaronder fraude, langdurige inactiviteit, misbruik van het account of het niet nakomen van deze Gebruiksvoorwaarden."
      />
      <LegalSection
        heading="9. Beëindiging van het platform"
        body="ZekerFlex kan te allen tijde besluiten het Platform geheel of gedeeltelijk niet langer aan te bieden in bepaalde gebieden of regio's, zonder aansprakelijk te zijn voor schade die daaruit voortvloeit."
      />
      <LegalSection
        heading="10. Onderhoud"
        body="ZekerFlex mag het Platform (tijdelijk) buiten gebruik stellen of de toegang beperken voor onderhoud, beveiliging of verbetering, zonder voorafgaande kennisgeving en zonder recht op schadevergoeding."
      />
      <LegalSection
        heading="11. Ratings en referenties"
        body="Na afronding van een Opdracht beoordelen Opdrachtgever en Opdrachtnemer elkaar naar waarheid en zorgvuldig. Een beoordeling bevat geen lasterlijke, vulgaire, obscene of racistische taal, geen persoonsgegevens en geen links of scripts. Partijen vrijwaren ZekerFlex voor aanspraken van derden die voortvloeien uit de inhoud van een beoordeling."
      />
      <LegalSection
        heading="12. Vervanging"
        body="Kan de Opdrachtnemer de Opdracht niet zelf uitvoeren, dan mag die zich via het Platform laten vervangen door een ander die in Nederland mag werken en over een geverifieerd account beschikt. ZekerFlex biedt hiervoor als aanvullende service een ruilsysteem aan; gebruik daarvan is facultatief en geheel voor eigen rekening en risico van de Opdrachtnemer, die volledig verantwoordelijk blijft voor tijdige en adequate vervanging. Buiten deze vervanging mag de Opdrachtnemer het Platform niet gebruiken om Opdrachten aan te nemen namens derden. Een nieuwe vervanger doorloopt eerst de identiteitscheck."
      />
      <LegalSection
        heading="13. No-show van de Opdrachtnemer"
        body="Annuleert de Opdrachtnemer een Opdracht zonder de annuleringstermijn in acht te nemen én zonder tijdig vervanging te regelen, dan geldt dat als een 'no-show' en wordt het no-show-percentage op het profiel verhoogd — zichtbaar voor toekomstige Opdrachtgevers. De Opdrachtgever kan hiervan binnen vier (4) weken na de aanvangsdatum melding doen. ZekerFlex kan het account daarop beperken of beëindigen. Krijgt de Opdrachtnemer een consequentie, dan kan de Opdrachtgever reeds toegewezen Opdrachten kosteloos annuleren. Wie meent dat een no-show onterecht is gemeld, dient binnen veertien (14) dagen na de melding om verwijdering te verzoeken; latere verzoeken worden niet behandeld."
      />
      <LegalSection
        heading="14. Contracteren buiten het Platform"
        body="Wil de Opdrachtgever een overeenkomst van opdracht aangaan met een Opdrachtnemer die via het Platform is gevonden of benaderd, dan gebeurt dat uitsluitend via het Platform. Gaat de Opdrachtgever buiten het Platform om zo'n overeenkomst aan, dan is die aan ZekerFlex een vergoeding van € 3.000 verschuldigd, vooraf te voldoen. Het staat Opdrachtgever en Opdrachtnemer vrij een arbeidsovereenkomst met elkaar aan te gaan."
      />
      <LegalSection
        heading="15. Intellectueel eigendom"
        body="De Opdrachtnemer blijft eigenaar van de inhoud die die op het Platform plaatst en verleent ZekerFlex een niet-exclusieve, royaltyvrije, wereldwijde licentie om die inhoud te gebruiken voor zover nodig om het Platform aan te bieden, te onderhouden en te verbeteren. Deze licentie eindigt zodra de Opdrachtnemer de inhoud of het account verwijdert, tenzij de inhoud met derden is gedeeld en zij die nog niet hebben verwijderd."
      />
      <LegalSection
        heading="16. Overmacht"
        body="Bij overmacht is ZekerFlex niet in verzuim en niet gehouden tot nakoming zolang de situatie voortduurt, en evenmin aansprakelijk voor schade. Onder overmacht valt onder meer: storingen in infrastructuur van derden, netwerk- en stroomuitval, overheidsmaatregelen, epidemieën en pandemieën."
      />
      <LegalSection
        heading="17. Kunstmatige intelligentie"
        body="ZekerFlex gebruikt AI-technologie om het Platform te verbeteren en om klantenservice- en chatfunctionaliteit aan te bieden. Deze systemen hebben geen invloed op de relatie tussen Opdrachtgever en Opdrachtnemer of op de uitvoering van de Opdracht. ZekerFlex kan deze systemen op elk moment aanpassen of verwijderen en geeft geen garanties over de juistheid of volledigheid van AI-gegenereerde resultaten; controleer dergelijke inhoud vóór gebruik. Voor zover wettelijk toegestaan is ZekerFlex niet aansprakelijk voor schade die daaruit voortvloeit."
      />
      <LegalSection
        heading="18. Verwijzingen naar derden"
        body="Het Platform kan links naar websites van derden bevatten. ZekerFlex heeft geen zeggenschap over de inhoud of het beleid van die websites en aanvaardt geen aansprakelijkheid voor het gebruik ervan."
      />
      <LegalSection
        heading="19. Gelijkheid en antidiscriminatie"
        body="Discriminatie op grond van ras, religie, afkomst, handicap, seksuele geaardheid, geslacht, genderidentiteit, burgerlijke staat, leeftijd of enig ander beschermd kenmerk is op het Platform ten strengste verboden — bij persoonlijke interacties, in beoordelingen en bij het leveren of accepteren van diensten. ZekerFlex kan bij (vermoedelijke) schending de toegang beperken of beëindigen. Ervaar je discriminatie of grensoverschrijdend gedrag, meld dat dan via onze supportkanalen; we behandelen meldingen vertrouwelijk."
      />
      <LegalSection
        heading="20. Toepasselijk recht en forumkeuze"
        body="Op deze Gebruiksvoorwaarden is Nederlands recht van toepassing. Geschillen worden exclusief voorgelegd aan de bevoegde rechter in het arrondissement Amsterdam."
      />
    </LegalPage>
  );
}
