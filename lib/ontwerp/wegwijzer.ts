import type { OntwerperTab } from "@/lib/ontwerp/tabs";

// ---------------------------------------------------------------------------
// "Zelf inrichten": waar je wat aanpast, in gewone taal (13 nov 2026, eigenaar: "alles moet ik kunnen inrichten, met simpele
// uitleg"). Eén lijst voor Beheer → Instellingen. Elke regel zegt wat je wilt doen, hoe het werkt, en brengt je er meteen.
// Puur bestand; een test bewaakt dat elke link bij een bestaand tabblad of een bestaande beheerpagina uitkomt.
// ---------------------------------------------------------------------------

export interface WegwijzerRegel {
  /** wat je wilt doen */
  wat: string;
  /** hoe het werkt, in één of twee zinnen */
  uitleg: string;
  /** een tabblad van de Site-ontwerper, of een andere beheerpagina */
  doel: { tab: OntwerperTab } | { pagina: string };
}

export const WEGWIJZER: WegwijzerRegel[] = [
  {
    wat: "De kleuren, letters en vormen van de site",
    uitleg: "Kies een kant-en-klare stijl of stel zelf kleuren, lettertypes, hoeken en knoppen in. Je ziet het meteen in het voorbeeld; bezoekers pas als je publiceert.",
    doel: { tab: "stijl" },
  },
  {
    wat: "Een tekst op de site veranderen",
    uitleg: "Klik in het voorbeeld op een tekst, of kies hem in de lijst. Eerdere versies van een tekst blijven bewaard.",
    doel: { tab: "teksten" },
  },
  {
    wat: "De volgorde van de homepage",
    uitleg: "Sleep een blok naar een andere plek, verberg het, of voeg een eigen blok toe. Pak een blok bij de greep (⠿).",
    doel: { tab: "home" },
  },
  {
    wat: "De webshop indelen",
    uitleg: "Sleep de onderdelen van de shop-pagina naar een andere plek of verberg ze. Opslaan zet het meteen live.",
    doel: { tab: "shop" },
  },
  {
    wat: "De teksten van de webshop",
    uitleg: "Alle teksten van de shop staan in het tabblad Teksten, onder Webshop. Een eigen tekst geldt voor de Nederlandse shop.",
    doel: { tab: "teksten" },
  },
  {
    wat: "Producten, prijzen, foto's en collecties",
    uitleg: "Producten toevoegen of aanpassen, varianten (maat en kleur), voorraad, bundels en de foto's van de shop.",
    doel: { pagina: "/admin/shop" },
  },
  {
    wat: "Het menu bovenaan en de voettekst",
    uitleg: "Knoppen hernoemen, verbergen, verslepen of een eigen link toevoegen. Hier staat ook de balk met een aankondiging bovenaan de site.",
    doel: { tab: "menu" },
  },
  {
    wat: "Een eigen pagina maken",
    uitleg: "Bouw een pagina uit blokken (tekst, foto, video, formulier) en zet hem online op een eigen adres. Blokken versleep je met de greep.",
    doel: { tab: "paginas" },
  },
  {
    wat: "Foto's en video's van de site",
    uitleg: "Upload beelden en kies welke foto op welke plek van de site staat.",
    doel: { tab: "media" },
  },
  {
    wat: "Hoe de site in Google staat",
    uitleg: "De titel en omschrijving per pagina, met een voorbeeld van het zoekresultaat.",
    doel: { tab: "seo" },
  },
  {
    wat: "Terug naar een eerdere versie",
    uitleg: "Elke publicatie van de stijl blijft bewaard. Kies een eerdere versie en zet hem terug.",
    doel: { tab: "geschiedenis" },
  },
  {
    wat: "Een functie aan- of uitzetten",
    uitleg: "Schakelaars voor onderdelen van ZekerFlex, zonder nieuwe versie. Bij elke schakelaar staat wat hij doet.",
    doel: { pagina: "/admin/systeem" },
  },
];

/** Het adres van een regel. */
export const wegwijzerHref = (r: WegwijzerRegel): string => ("tab" in r.doel ? `/admin/ontwerper?tab=${r.doel.tab}` : r.doel.pagina);
