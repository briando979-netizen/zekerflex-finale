import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";

export const metadata: Metadata = { title: "Toegankelijkheid" };

export default function ToegankelijkheidPage() {
  return (
    <LegalPage
      title="Toegankelijkheid"
      updated="14 oktober 2026"
      intro="ZekerFlex moet bruikbaar zijn voor iedereen, ongeacht beperking of hulpmiddel. Dit is een eerlijke stand van zaken — geen keurmerk, want we hebben nog geen volledige, onafhankelijke toetsing laten uitvoeren."
      note={
        <>
          Loop je tegen iets aan dat niet toegankelijk is? Mail{" "}
          <a href="mailto:info@zekerflex.com" className="text-brand-600 underline">
            info@zekerflex.com
          </a>{" "}
          met de pagina en wat er misging — we proberen het zo snel mogelijk op te lossen.
        </>
      }
    >
      <LegalSection
        heading="1. Ons streven"
        body="We bouwen het platform met de Web Content Accessibility Guidelines (WCAG) 2.2, niveau AA, als richtlijn. Dat is de maatstaf waar we naartoe werken bij nieuwe en bestaande schermen — niet (nog) een behaald certificaat."
      />
      <LegalSection
        heading="2. Huidige status"
        body="Er is nog geen volledige, onafhankelijke WCAG-audit uitgevoerd over het hele platform. Sommige onderdelen zijn beter getest dan andere. We werken dit gestaag bij en passen schermen aan zodra we een knelpunt kennen — via eigen controle of via meldingen van gebruikers."
      />
      <LegalSection
        heading="3. Wat al wel is meegenomen"
        list={[
          "Semantische HTML en koppen-structuur, zodat schermlezers de pagina logisch kunnen doorlopen.",
          "Toetsenbordbediening voor de belangrijkste stappen (inloggen, een klus plaatsen, uren goedkeuren, afrekenen in de shop).",
          "Zichtbare focus-indicatoren op interactieve elementen.",
          "Voldoende kleurcontrast in de huisstijl voor leesbare tekst.",
          "Alternatieve tekst bij productafbeeldingen in de webshop.",
        ]}
      />
      <LegalSection
        heading="4. Bekende beperkingen"
        body="Sommige complexere schermen (zoals de live chat en de kalenderweergave) zijn nog niet volledig getest met een schermlezer. Formuliervalidatie geeft niet overal even duidelijk aan welk veld aandacht nodig heeft. We geven dit hier bewust aan in plaats van een volledigheid te beweren die er nog niet is."
      />
      <LegalSection
        heading="5. Contact en meldingen"
        body="Kom je een drempel tegen — een knop die niet met het toetsenbord werkt, tekst die niet voorgelezen wordt, contrast dat te laag is — laat het ons weten via info@zekerflex.com. Vermeld de pagina (of een link) en, indien van toepassing, welk hulpmiddel je gebruikt. We nemen elke melding serieus en koppelen terug wat we ermee doen."
      />
    </LegalPage>
  );
}
