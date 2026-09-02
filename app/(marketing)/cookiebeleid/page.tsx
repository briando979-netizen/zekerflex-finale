import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";

export const metadata: Metadata = { title: "Cookiebeleid" };

export default function CookiebeleidPage() {
  return (
    <LegalPage
      title="Cookiebeleid"
      updated="1 mei 2026"
      intro="Dit cookiebeleid geldt voor onze website zekerflex.com en de ZekerFlex-app (samen: 'het platform') en voor bezoekers uit de Europese Economische Ruimte en Zwitserland."
      note={
        <>
          Vragen of opmerkingen over dit cookiebeleid? Mail{" "}
          <a href="mailto:privacy@zekerflex.com" className="text-brand-600 underline">
            privacy@zekerflex.com
          </a>
          .
        </>
      }
    >
      <LegalSection
        heading="1. Introductie"
        body="Op het platform gebruiken we cookies en vergelijkbare technieken (voor het gemak noemen we alles hierna 'cookies'). Hieronder leggen we uit welke we gebruiken en waarom. ZekerFlex is een zelf-gehost, onafhankelijk platform: we gebruiken geen advertentie- of trackingcookies en geen externe analytics- of marketingdiensten."
      />
      <LegalSection
        heading="2. Wat is een cookie?"
        body="Een cookie is een klein bestandje dat met pagina's van deze site wordt meegestuurd en door je browser wordt opgeslagen op je apparaat. Bij een volgend bezoek kan de opgeslagen informatie weer naar onze servers worden teruggestuurd."
      />
      <LegalSection
        heading="3. Wat is een script?"
        body="Een script is een stukje programmacode dat het platform laat functioneren en interactief maakt. Deze code draait op onze eigen servers of op je apparaat."
      />
      <LegalSection
        heading="4. Wat is een web beacon?"
        body="Een web beacon (ook pixeltag) is een klein, vaak onzichtbaar element op een pagina waarmee bezoek in kaart kan worden gebracht. ZekerFlex plaatst geen web beacons van derden."
      />
      <LegalSection
        heading="5. Welke cookies we gebruiken"
        body="We onderscheiden drie categorieën. Alleen de eerste twee zijn op het platform aanwezig."
      />
      <LegalSection
        heading="5.1 Functionele cookies"
        body="Deze zorgen dat het platform werkt en dat je voorkeuren bewaard blijven — bijvoorbeeld je ingelogde sessie, je taal- of weergavevoorkeur en je cookie-keuze. Zonder deze cookies werkt het platform niet goed. We plaatsen ze zonder toestemming, omdat ze strikt noodzakelijk zijn."
      />
      <LegalSection
        heading="5.2 Statistische verwerking (zonder cookies)"
        body="We meten geaggregeerd hoe het platform wordt gebruikt om de prestaties te verbeteren. Dit gebeurt zonder cookies en zonder externe trackers; browsergegevens worden alleen als versleutelde hash bewaard en niet gebruikt om je te identificeren. Hiervoor is geen toestemming nodig."
      />
      <LegalSection
        heading="5.3 Marketing- en trackingcookies"
        body="Die gebruiken we niet. We tonen geen advertenties, we delen geen gegevens met advertentienetwerken en we volgen je niet over andere websites."
      />
      <LegalSection
        heading="5.4 Social media"
        body="We sluiten standaard geen social-media-widgets in die cookies plaatsen. Klik je op een link naar een extern socialmedia-kanaal, dan gelden het privacybeleid en de cookies van dat platform; lees die daar goed door."
      />
      <LegalSection
        heading="6. Geplaatste cookies"
        list={[
          "Sessiecookie — functioneel — houdt je ingelogde sessie vast tijdens je bezoek.",
          "Cookie-keuze — functioneel — onthoudt of en welke keuze je in de cookiemelding hebt gemaakt.",
          "Voorkeuren (taal, weergave) — functioneel — onthoudt kleine instellingen zodat je ze niet steeds opnieuw hoeft te kiezen.",
        ]}
      />
      <LegalSection
        heading="7. Toestemming"
        body="Bij je eerste bezoek tonen we een korte melding over cookies. Omdat we uitsluitend strikt noodzakelijke functionele cookies gebruiken, is er geen toestemming vereist voor het plaatsen daarvan. Je kunt cookies altijd via je browser weigeren of verwijderen; houd er dan rekening mee dat het platform mogelijk niet meer optimaal werkt."
      />
      <LegalSection
        heading="8. Cookies in- of uitschakelen en verwijderen"
        body="Via je browser kun je cookies automatisch of handmatig verwijderen, bepaalde cookies weigeren, of instellen dat je een melding krijgt bij het plaatsen van een cookie. Zie hiervoor de Help-functie van je browser. Verwijder je de functionele cookies, dan worden ze bij een volgend bezoek opnieuw geplaatst."
      />
      <LegalSection
        heading="9. Je rechten met betrekking tot persoonsgegevens"
        body="Je hebt onder meer recht op inzage, rectificatie en aanvulling, verwijdering, beperking, bezwaar en dataportabiliteit, en het recht een gegeven toestemming in te trekken. Om deze rechten uit te oefenen kun je contact met ons opnemen via de gegevens hieronder. Heb je een klacht over hoe we met je gegevens omgaan, dan horen we dat graag; je kunt ook een klacht indienen bij de Autoriteit Persoonsgegevens."
      />
      <LegalSection
        heading="10. Contactinformatie"
        list={[
          "ZekerFlex B.V.",
          "Amsterdam, Nederland",
          "Website: zekerflex.com",
          "E-mail: privacy@zekerflex.com",
        ]}
      />
    </LegalPage>
  );
}
