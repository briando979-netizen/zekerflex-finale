import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";

export const metadata: Metadata = { title: "Verwerkersovereenkomst" };

export default function VerwerkersovereenkomstPage() {
  return (
    <LegalPage
      title="Verwerkersovereenkomst"
      updated="1 mei 2026"
      note={
        <>
          Wil je deze verwerkersovereenkomst als apart getekend document? Mail{" "}
          <a href="mailto:privacy@zekerflex.com" className="text-brand-600 underline">
            privacy@zekerflex.com
          </a>
          .
        </>
      }
    >
      <LegalSection
        heading="Onderwerp"
        body="Deze verwerkersovereenkomst is van toepassing wanneer een opdrachtgever (verwerkingsverantwoordelijke) persoonsgegevens laat verwerken door ZekerFlex (verwerker) in het kader van het gebruik van het platform."
      />
      <LegalSection
        heading="Instructies"
        body="ZekerFlex verwerkt persoonsgegevens uitsluitend op basis van gedocumenteerde instructies van de verwerkingsverantwoordelijke en voor de doeleinden die in de algemene voorwaarden zijn beschreven."
      />
      <LegalSection
        heading="Beveiliging"
        body="Gegevens worden versleuteld opgeslagen op infrastructuur die volledig in Nederland draait. Toegang is rolgebaseerd en elke gevoelige handeling wordt vastgelegd in een onwisbaar auditspoor."
      />
      <LegalSection
        heading="Subverwerkers"
        body="ZekerFlex maakt voor de kernfuncties van het platform geen gebruik van externe cloud- of AI-subverwerkers. Voor identiteitsverificatie en handelsregistervalidatie worden gespecialiseerde Nederlandse/EU-partijen ingezet; een actueel overzicht is op verzoek beschikbaar."
      />
      <LegalSection
        heading="Datalekken"
        body="Bij een inbreuk in verband met persoonsgegevens informeert ZekerFlex de verwerkingsverantwoordelijke zonder onredelijke vertraging, met alle informatie die nodig is om aan de meldplicht te voldoen."
      />
    </LegalPage>
  );
}
