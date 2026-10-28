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
        body="ZekerFlex treft passende technische en organisatorische maatregelen om persoonsgegevens te beveiligen. Toegang is beperkt tot bevoegde personen voor zover dat nodig is voor hun werkzaamheden. Hosting en andere technische diensten kunnen door subverwerkers worden geleverd."
      />
      <LegalSection
        heading="Subverwerkers"
        body="ZekerFlex kan subverwerkers inzetten voor hosting, betalingen, e-mail, identiteitsverificatie, handelsregistervalidatie en andere platformfuncties. Op verzoek verstrekt ZekerFlex een actueel overzicht van de betrokken subverwerkers."
      />
      <LegalSection
        heading="Datalekken"
        body="Bij een inbreuk in verband met persoonsgegevens informeert ZekerFlex de verwerkingsverantwoordelijke zonder onredelijke vertraging, met alle informatie die nodig is om aan de meldplicht te voldoen."
      />
    </LegalPage>
  );
}
