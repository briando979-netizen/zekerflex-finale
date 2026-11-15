// ---------------------------------------------------------------------------
// De inhoud van /aanbod/e-facturatie (components/marketing/aanbod/EfactuurPagina.tsx, 15 nov 2026). Alleen wat nu echt kan
// (AGENTS.md: alleen wat echt kan staat op de site), nagelopen in de code:
//  - een UBL-bestand bij elke factuur (lib/efactuur/ubl.ts), vooraf gecontroleerd (lib/efactuur/factuur.ts);
//  - automatisch per mail naar het ontvangstadres van het boekhoudpakket, of downloaden (lib/efactuur/bezorging.ts,
//    Werkgever → Facturen, knop "UBL ↓");
//  - Peppol alleen met een toegangspunt (PEPPOL_AP_URL): op 15 nov niet ingesteld (owner-todo), dus "komt eraan";
//  - geen betaalverzoek of QR-betalen: dat liep via ZekerFlex Bank (staat uit) of Stripe (dicht).
// Puur bestand.
// ---------------------------------------------------------------------------

export const EFACTUUR_STAPPEN = [
  { label: "Uren", titel: "Keur de uren goed", tekst: "Je keurt de gewerkte uren goed in je werkgeversomgeving, zoals je al gewend bent." },
  { label: "Factuur", titel: "De factuur staat klaar", tekst: "ZekerFlex maakt de factuur met alles wat erop moet: nummer, datum, btw, KVK- en btw-nummer." },
  { label: "Controle", titel: "Wij controleren hem", tekst: "De e-factuur wordt getoetst aan de Europese regels die boekhoudpakketten gebruiken, vóór hij de deur uit gaat." },
  { label: "Boekhouding", titel: "Hij staat in je boekhouding", tekst: "Hij gaat per mail naar je boekhoudpakket, of je downloadt het bestand. Overtypen hoeft niet meer." },
] as const;

export const EFACTUUR_FUNCTIES: { label: string; titel: string; tekst: string; binnenkort?: boolean }[] = [
  { label: "Bij elke factuur", titel: "Een UBL-bestand", tekst: "Volgens de Europese norm EN 16931 (Peppol BIS 3 en de Nederlandse NLCIUS). Hetzelfde bestand dat boekhoudpakketten zelf inlezen." },
  { label: "Automatisch", titel: "Naar je boekhoudpakket", tekst: "Vul één keer het mailadres in waarop je pakket inkoopfacturen ontvangt. Elke nieuwe factuur gaat er vanzelf heen." },
  { label: "Vooraf", titel: "Gecontroleerd", tekst: "Een e-factuur met een fout wordt door een pakket geweigerd. Daarom controleren we hem eerst op de regels die pakketten gebruiken." },
  { label: "Altijd", titel: "Te downloaden", tekst: "Bij elke factuur staat de knop UBL: zo heb je het bestand ook zonder mail, bijvoorbeeld voor je boekhouder." },
  { label: "Bijgehouden", titel: "Per factuur vastgelegd", tekst: "ZekerFlex legt bij elke factuur vast wat er met de e-factuur gebeurde: gemaakt, gecontroleerd, verstuurd. Lukte versturen niet, dan staat hij klaar om te downloaden." },
  {
    label: "Netwerk",
    titel: "Via Peppol",
    tekst: "Peppol bezorgt e-facturen rechtstreeks op je KVK- of btw-nummer. We koppelen het netwerk nog; tot die tijd gaat je e-factuur per mail of download je hem. Je Peppol-adres kun je alvast invullen.",
    binnenkort: true,
  },
];

export const EFACTUUR_ZIT_ERIN: { wat: string; binnenkort?: boolean }[] = [
  { wat: "E-factuur (UBL) bij elke factuur" },
  { wat: "Controle op de Europese regels" },
  { wat: "Automatisch naar het mailadres van je boekhoudpakket" },
  { wat: "Downloaden bij elke factuur" },
  { wat: "Op de computer en op je telefoon" },
  { wat: "Bezorgen via het Peppol-netwerk", binnenkort: true },
];

export const EFACTUUR_FAQ: { vraag: string; antwoord: string }[] = [
  {
    vraag: "Wat is een e-factuur?",
    antwoord:
      "Een factuur als gestructureerd bestand (UBL) in plaats van alleen een pdf. Je boekhoudpakket leest leverancier, factuurregels, btw en bedrag zelf in. Je hoeft niets over te typen en er sluipen geen tikfouten in.",
  },
  {
    vraag: "Is UBL hetzelfde als Peppol?",
    antwoord:
      "Nee. UBL is het bestand zelf; Peppol is een netwerk dat zulke bestanden bezorgt op een KVK- of btw-nummer. ZekerFlex maakt het UBL-bestand nu al bij elke factuur. Bezorgen via Peppol koppelen we nog; tot die tijd gaat hij per mail of download je hem.",
  },
  {
    vraag: "Welke boekhoudpakketten lezen het in?",
    antwoord:
      "Pakketten die e-facturen in UBL inlezen, zoals Exact Online, Twinfield, e-Boekhouden.nl, Moneybird en AFAS. Meestal geeft je pakket je een eigen mailadres voor inkoopfacturen: dat vul je bij ZekerFlex in.",
  },
  {
    vraag: "Wat moet ik instellen?",
    antwoord:
      "Alleen het mailadres waarop je boekhoudpakket inkoopfacturen ontvangt, onder Werkgever → Facturen. Zonder dat adres werkt het ook: dan download je de e-factuur bij elke factuur met de knop UBL.",
  },
  {
    vraag: "Wat kost het?",
    antwoord: "Niets extra. E-facturatie is inbegrepen bij elk ZekerFlex-account, zonder abonnement.",
  },
  {
    vraag: "Wordt de e-factuur verplicht?",
    antwoord:
      "De Europese Unie maakt de e-factuur verplicht voor zakelijke facturen tussen EU-landen, vanaf 1 juli 2030. Met ZekerFlex heb je hem nu al bij elke factuur, dus je hoeft later niets om te zetten.",
  },
];
