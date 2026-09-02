import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";

export const metadata: Metadata = { title: "Digital Services Act-informatie" };

export default function DsaPage() {
  return (
    <LegalPage
      title="Digital Services Act-informatie"
      updated="1 mei 2026"
      intro="Op grond van de Digital Services Act (Verordening (EU) 2022/2065, 'DSA') publiceert ZekerFlex de volgende informatie."
      note={
        <>
          Vragen over deze informatie? Mail{" "}
          <a href="mailto:voorwaarden@zekerflex.com" className="text-brand-600 underline">
            voorwaarden@zekerflex.com
          </a>
          .
        </>
      }
    >
      <LegalSection
        heading="1. Contactpunt voor autoriteiten (art. 11 DSA)"
        body="Ons centrale communicatiepunt met de autoriteiten van de lidstaten, de Europese Commissie en de European Board for Digital Services is:"
        list={["E-mail: voorwaarden@zekerflex.com", "Talen: Nederlands of Engels"]}
      />
      <LegalSection
        heading="2. Contactpunt voor gebruikers (art. 12 DSA)"
        body="Wil je illegale content op het platform of de website van ZekerFlex melden, stuur dan een e-mail naar support@zekerflex.com. Vermeld daarbij:"
        list={[
          "Een met redenen omklede verklaring waarom je denkt dat de informatie illegaal is.",
          "De exacte elektronische locatie van de informatie (URL) en, waar nodig, aanvullende informatie om de content te identificeren.",
          "Je naam en e-mailadres (indien nodig om te kunnen beoordelen of de content illegaal is).",
          "Een bevestiging dat je te goeder trouw gelooft dat de informatie in je melding juist en volledig is.",
        ]}
      />
      <LegalSection
        heading="3. Kennisgevings- en actiemechanisme (art. 16 DSA)"
        body="Personen en organisaties kunnen ons via onze contactkanalen op de hoogte brengen van informatie die volgens hen illegaal is. Een melding bevat:"
        list={[
          "Een voldoende gemotiveerde verklaring waarom de informatie als illegale content wordt beschouwd.",
          "Een duidelijke indicatie van de exacte elektronische locatie (URL of URL's) en waar nodig aanvullende informatie.",
          "De naam en het e-mailadres van de melder — behalve bij informatie die betrekking zou hebben op strafbare feiten rond seksueel misbruik of uitbuiting van kinderen.",
          "Een verklaring te goeder trouw dat de informatie en beweringen in de melding accuraat en volledig zijn.",
        ]}
      />
      <LegalSection
        heading="4. Interne klachtenafhandeling en buitengerechtelijke geschillenbeslechting (art. 20 en 21 DSA)"
        body="ZekerFlex kan geplaatste informatie wijzigen, verwijderen of de toegang daartoe beperken om de kwaliteit van het platform te waarborgen of om illegale content aan te pakken. De plaatser wordt hiervan op de hoogte gesteld en kan binnen zes maanden na die kennisgeving een klacht indienen via onze contactkanalen. We behandelen klachten tijdig. Je kunt een geschil ook voorleggen aan een in een EU-lidstaat gecertificeerde buitengerechtelijke geschilleninstantie. Deze informatie beperkt je recht niet om in rechte tegen ZekerFlex op te treden."
      />
      <LegalSection
        heading="5. Maatregelen tegen misbruik (art. 23 DSA)"
        body="Na een voorafgaande waarschuwing schorten we onze diensten tijdelijk op voor gebruikers die herhaaldelijk duidelijk illegale content delen, en voor personen of organisaties die stelselmatig duidelijk ongegronde meldingen of klachten indienen. Elke situatie beoordelen we tijdig, eerlijk en objectief. Daarbij wegen we ten minste mee:"
        list={[
          "het absolute aantal duidelijk illegale of duidelijk ongegronde meldingen binnen een bepaalde periode;",
          "het relatieve aandeel daarvan ten opzichte van alle verstrekte informatie of ingediende klachten;",
          "de ernst van het misbruik, waaronder de aard en de gevolgen van de content;",
          "voor zover vast te stellen, de intentie van de betrokkene.",
        ]}
      />
      <LegalSection
        heading="6. Transparantie van aanbevelingssystemen (art. 27 DSA)"
        body="ZekerFlex rangschikt klussen in je overzicht op basis van een aantal factoren:"
        list={[
          "je voorkeuren voor functies en sectoren;",
          "klussen waarvoor je eerder bent uitgekozen;",
          "je eerdere reacties op bepaalde klussen;",
          "je adres — hoe korter de reistijd, hoe hoger de aanbeveling;",
          "door opdrachtgevers bevestigde vaardigheden op je profiel.",
        ]}
      />
      <LegalSection
        heading=""
        body="Je hebt hier zelf invloed op: pas je adres of je voorkeuren voor functies en sectoren aan om ander aanbod te zien. Wil je geen aanbevelingen? Kies dan een andere sortering, zoals 'laatst toegevoegd' in plaats van 'aanbevolen'. De rangschikking draait volledig op onze eigen infrastructuur in Nederland; er wordt geen externe advertentie- of profileringsdienst gebruikt."
      />
    </LegalPage>
  );
}
