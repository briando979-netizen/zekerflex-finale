import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";

export const metadata: Metadata = { title: "Privacybeleid" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacybeleid"
      updated="1 mei 2026"
      intro="In dit privacybeleid leggen we uit welke gegevens ZekerFlex B.V. ('ZekerFlex') verzamelt als je onze website of app gebruikt of je inschrijft, waarom we die nodig hebben, met wie we ze delen en hoe lang we ze bewaren. We volgen de AVG. Door onze diensten te gebruiken ga je akkoord met dit beleid. Dit beleid kan wijzigen; deze versie geldt sinds 1 mei 2026."
      note={
        <>
          Vragen of een verzoek over je gegevens? Mail{" "}
          <a href="mailto:privacy@zekerflex.com" className="text-brand-600 underline">
            privacy@zekerflex.com
          </a>
          . Sommige gegevens pas je zelf aan in je account.
        </>
      }
    >
      <LegalSection
        heading="Wat doen we met jouw gegevens?"
        body="We verwerken persoonsgegevens om onze diensten te laten werken: je profiel tonen, het platform veilig houden, het gebruik analyseren en aan wettelijke verplichtingen voldoen. Afhankelijk van je rol kunnen we de volgende gegevens verwerken:"
        list={[
          "Naam, adres en woonplaats",
          "Geboortedatum, geslacht, nationaliteit en burgerlijke staat",
          "E-mailadres en telefoonnummer",
          "Burgerservicenummer (BSN)",
          "Kopie identiteitsbewijs en profielfoto",
          "CV, diploma's en informatie over opleidingen",
          "Arbeidsverleden, beschikbaarheid en verlof",
          "Bankrekeningnummer",
          "IP-adres",
        ]}
      />
      <LegalSection
        body="We verwerken deze gegevens om de diensten uit te voeren, op grond van ons gerechtvaardigd belang, omdat we een overeenkomst met je aangaan, omdat je toestemming hebt gegeven, of omdat het onze wettelijke verplichting is."
      />
      <LegalSection
        heading="Werken via een UBD-formulier"
        body="Wil je werken zonder btw-id, dan vragen we je BSN. Dat is nodig zodat de opdrachtgever een UBD-formulier voor de Belastingdienst kan invullen. ZekerFlex verwerkt deze gegevens als verwerker en deelt ze één keer per jaar, via de beveiligde ZekerFlex-omgeving, met de opdrachtgevers waarvoor je hebt gewerkt."
      />
      <LegalSection
        heading="Contact met opdrachtgevers"
        body="We houden klantcontacten bij in onze eigen software. Meldt een opdrachtgever zich aan, dan gaat die akkoord met onze gebruiksvoorwaarden en wordt de contactpersoon toegevoegd aan ons systeem. We verwerken daarbij alleen naam, e-mailadres en telefoonnummer, om uitvoering te geven aan de gebruiksovereenkomst."
      />
      <LegalSection
        heading="Nieuwsbrief"
        body="Je kunt je aanmelden voor onze nieuwsbrief. We verwerken daarvoor je e-mailadres op basis van jouw toestemming (dubbele opt-in). Je meldt je op elk moment af via de link onderaan elke nieuwsbrief."
      />
      <LegalSection
        heading="Diensten verbeteren"
        body="We analyseren geaggregeerd hoe bezoekers het platform gebruiken om onze diensten te verbeteren, op grond van ons gerechtvaardigd belang. Dit gebeurt zonder cookies en zonder externe trackers; zie het cookiebeleid."
      />
      <LegalSection
        heading="Advertenties"
        body="ZekerFlex toont geen advertenties en doet niet aan behavioural advertising. We delen je gegevens niet met advertentienetwerken."
      />
      <LegalSection
        heading="Fraude voorkomen"
        body="Frauderen we iemand aantreffen, dan verwijderen we die van het platform en houden we gegevens bij op een interne zwarte lijst, zodat opnieuw aanmelden niet mogelijk is. We verwerken hiervoor NAW-gegevens, e-mailadres, geboortedatum en bankrekeningnummer, plus IP-adressen om te bepalen vanaf welk apparaat malafide handelingen zijn verricht. Dit doen we op grond van ons gerechtvaardigd belang, voor een periode van tien jaar, omdat fraude langdurige risico's en een hoog risico op herhaling meebrengt. Word je verwijderd, dan krijg je daarvan bericht met de duur van de blokkade."
      />
      <LegalSection
        heading="DAC7"
        body="Ben je als freelancer boven een grenswaarde actief — meer dan € 2.000 aan opdrachten of meer dan dertig opdrachten in een rapportagejaar — dan zijn we op grond van DAC7 verplicht gegevens over jou te delen met de Belastingdienst: NAW-gegevens, btw-nummer, KvK-nummer, BSN en bankrekeningnummer. Ontbreken hiervoor gegevens, dan kunnen we je account blokkeren tot je die aanvult. Meer informatie staat op de website van de Belastingdienst."
      />
      <LegalSection
        heading="Profielfoto en identiteitsverificatie"
        body="Je bent verplicht een herkenbare profielfoto te hebben waaruit je identiteit duidelijk blijkt; je account delen mag niet. Zo weet de opdrachtgever dat de persoon die komt werken ook echt in Nederland mag werken. We verwerken je profielfoto op grond van ons gerechtvaardigd belang. Zorg voor een scherpe, goed belichte foto zonder zonnebril, pet of sjaal, en upload geen foto van een foto of scherm."
      />
      <LegalSection
        body="We vergelijken je profielfoto met de foto van je identiteitsverificatie bij registratie. Die vergelijking draait op onze eigen infrastructuur in Nederland; er komt geen automatische besluitvorming aan te pas — een medewerker beoordeelt altijd. Komt de foto niet overeen, dan vragen we je per e-mail om een nieuwe foto en blokkeren we je account tot je die hebt geüpload (reeds ingeplande klussen voer je nog uit, reageren op nieuwe kan niet). Stellen we accountfraude vast, dan annuleren we ingeplande opdrachten en blokkeren we je account voor onbepaalde tijd. Ben je het er niet mee eens, neem dan contact op met support."
      />
      <LegalSection
        heading="Toegang tot jouw gegevens"
        body="We delen je gegevens met partners die bij onze dienst betrokken zijn, zoals de partij die je verzekering regelt en de partij die de identiteitscheck verzorgt. Zij mogen je gegevens alleen voor het afgesproken doel gebruiken en behandelen ze veilig. ZekerFlex is een onafhankelijk bedrijf zonder moeder- of dochterondernemingen; we geven je gegevens niet aan anderen zonder jouw toestemming, tenzij dit in dit privacybeleid staat."
      />
      <LegalSection
        heading="Jouw rechten"
        list={[
          "Informatie: weten waarom we je gegevens nodig hebben, wat ermee gebeurt en hoe lang we ze bewaren.",
          "Inzage: opvragen welke gegevens we van je hebben.",
          "Correctie: gegevens aanpassen of corrigeren, deels zelf in de app.",
          "Verwijdering: je gegevens laten verwijderen, deels via de app. Sommige gegevens (NAW, btw-nummer, KvK-nummer, geboortedatum, BSN, bankrekeningnummer) moeten we wettelijk langer bewaren voor onze rapportageverplichtingen.",
          "Toestemming intrekken: gaf je toestemming, dan kun je die altijd intrekken.",
          "Dataportabiliteit: je gegevens opvragen en laten overdragen.",
          "Bezwaar: bezwaar maken tegen de verwerking van je gegevens.",
        ]}
      />
      <LegalSection
        body="Heb je een klacht, laat het ons weten. Je kunt ook een klacht indienen bij de Autoriteit Persoonsgegevens."
      />
      <LegalSection
        heading="Bewaartermijnen"
        body="We bewaren je gegevens niet langer dan nodig, afhankelijk van het doel en wettelijke verplichtingen. Daarna verwijderen of anonimiseren we ze."
      />
      <LegalSection
        heading="Contact"
        list={[
          "ZekerFlex B.V. — afdeling Support",
          "Amsterdam, Nederland",
          "E-mail: privacy@zekerflex.com",
        ]}
      />
    </LegalPage>
  );
}
