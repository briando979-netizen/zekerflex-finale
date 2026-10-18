import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";

export const metadata: Metadata = { title: "Voorwaarden snelle uitbetaling" };

// Versie 2026-10 — dezelfde versie als FACTORING_TERMS_VERSION in
// lib/payouts/fastpay.ts. Wijzig je deze tekst inhoudelijk, verhoog dan de
// versie daar: dan moet iedereen opnieuw akkoord geven.
export default function SnelleUitbetalingPage() {
  return (
    <LegalPage
      title="Voorwaarden snelle uitbetaling"
      updated="18 oktober 2026 (versie 2026-10)"
      intro="Deze voorwaarden gelden als je als Opdrachtnemer kiest voor uitbetaling binnen 1 minuut of binnen 3 werkdagen na goedkeuring van je uren. Ze vullen de Gebruiksvoorwaarden van ZekerFlex aan."
      note={
        <>
          Vragen? Mail{" "}
          <a href="mailto:voorwaarden@zekerflex.com" className="text-brand-600 underline">
            voorwaarden@zekerflex.com
          </a>
          .
        </>
      }
    >
      <LegalSection
        heading="1. Wat snelle uitbetaling is"
        body="Normaal ontvang je je factuurbedrag zodra de Opdrachtgever betaalt. Kies je voor snelle uitbetaling, dan draag je je vordering op de Opdrachtgever voor die klus over aan ZekerFlex (cessie, art. 3:94 BW). ZekerFlex betaalt jou daarvoor direct het factuurbedrag minus de vergoeding, en int het volledige bedrag zelf bij de Opdrachtgever."
      />
      <LegalSection
        heading="2. Vergoeding"
        list={[
          "Uitbetaling binnen 1 minuut na goedkeuring van je uren: 4% van het factuurbedrag.",
          "Uitbetaling binnen 3 werkdagen na goedkeuring: 2% van het factuurbedrag.",
          "Standaard (wachten tot de Opdrachtgever betaalt): geen vergoeding.",
        ]}
      />
      <LegalSection
        heading="3. Wanneer het kan"
        body="Snelle uitbetaling is alleen beschikbaar bij Opdrachtgevers die dit aanbieden en daarvoor een kredietbeoordeling door ZekerFlex hebben doorlopen. Bij elke klus staat of snelle uitbetaling mogelijk is. De overdracht geldt alleen voor klussen waarbij jij voor snelle uitbetaling kiest, en pas nadat de Opdrachtgever je uren heeft goedgekeurd."
      />
      <LegalSection
        heading="4. Risico"
        body="Na de overdracht draagt ZekerFlex het risico dat de Opdrachtgever niet betaalt. Blijkt achteraf dat de uren niet zijn gewerkt zoals opgegeven, of wordt de goedkeuring wegens fraude of een vergissing ingetrokken, dan mag ZekerFlex het uitbetaalde bedrag terugvorderen of verrekenen met latere uitbetalingen."
      />
      <LegalSection
        heading="5. Akkoord en intrekken"
        body="Je geeft eenmalig akkoord op deze versie van de voorwaarden; ZekerFlex legt het tijdstip en je apparaat vast. Je kunt altijd terug naar standaard uitbetaling voor nieuwe klussen. Bij een inhoudelijke wijziging van deze voorwaarden vragen we opnieuw om akkoord."
      />
    </LegalPage>
  );
}
