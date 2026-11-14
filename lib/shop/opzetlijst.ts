// De opzetlijst van Mijn winkel (14 nov 2026), zoals bij Wix: een korte lijst stappen met een vinkje, uit ECHTE gegevens, elk met één knop naar de
// goede plek. Puur: de pagina (app/admin/webshop/page.tsx) meet de stand, dit bestand maakt er de stappen van. Geen vinkje dat niet gemeten is, en
// "Betalen" zegt eerlijk dicht zolang Stripe dat meldt.

export interface OpzetStand {
  /** alle producten, zichtbaar of niet */
  producten: number;
  zichtbaar: number;
  /** zichtbare producten zonder foto */
  zonderFoto: number;
  /** heeft de eigenaar eigen teksten in de winkel gezet (Site-ontwerper, tabblad Teksten)? */
  eigenTeksten: boolean;
  /** kan de winkel betalingen ontvangen? null = nog niet gemeten */
  betalen: boolean | null;
  /** betaalde bestellingen ooit */
  betaaldTotaal: number;
}

export interface OpzetStap {
  id: "product" | "zichtbaar" | "fotos" | "inrichten" | "betalen" | "bestelling";
  titel: string;
  /** wat deze stap betekent, in gewoon Nederlands */
  uitleg: string;
  /** true = klaar, false = nog te doen, null = niet te meten */
  klaar: boolean | null;
  /** korte status naast het vinkje */
  status: string;
  href: string;
  knop: string;
}

export function opzetStappen(s: OpzetStand): OpzetStap[] {
  const betalenStatus = s.betalen === null ? "Nog niet gemeten" : s.betalen ? "Klanten kunnen betalen" : "Dicht: klanten kunnen nu niet betalen";
  return [
    {
      id: "product",
      titel: "Zet je eerste product erin",
      uitleg: "Een product met een naam, een korte omschrijving en een prijs. Een foto en de voorraad kun je erna zetten.",
      klaar: s.producten > 0,
      status: s.producten > 0 ? `${s.producten} product${s.producten === 1 ? "" : "en"} aangemaakt` : "Nog geen producten",
      href: "/admin/shop?nieuw=1",
      knop: s.producten > 0 ? "Nog een product" : "Product toevoegen",
    },
    {
      id: "zichtbaar",
      titel: "Maak minstens één product zichtbaar",
      uitleg: "Alleen zichtbare producten staan in je winkel. Een nieuw product staat eerst verborgen tot jij het aanzet.",
      klaar: s.zichtbaar > 0,
      status: s.zichtbaar > 0 ? `${s.zichtbaar} zichtbaar` : "Er staat niets in je winkel",
      href: "/admin/shop",
      knop: "Naar de producten",
    },
    {
      id: "fotos",
      titel: "Zet bij elk zichtbaar product een foto",
      uitleg: "Een product zonder foto verkoopt bijna niet.",
      klaar: s.zichtbaar === 0 ? false : s.zonderFoto === 0,
      status: s.zichtbaar === 0 ? "Eerst een zichtbaar product" : s.zonderFoto === 0 ? "Alle zichtbare producten hebben een foto" : `${s.zonderFoto} zonder foto`,
      href: "/admin/shop",
      knop: "Foto's toevoegen",
    },
    {
      id: "inrichten",
      titel: "Richt je winkel in",
      uitleg: "Pas de teksten, de indeling en de kleuren van je winkel aan en zie meteen hoe het eruitziet.",
      klaar: s.eigenTeksten,
      status: s.eigenTeksten ? "Eigen teksten gezet" : "Nog niets aangepast",
      href: "/admin/ontwerper?tab=shop",
      knop: "Winkel inrichten",
    },
    {
      id: "betalen",
      titel: "Zorg dat klanten kunnen betalen",
      uitleg: s.betalen === false ? "Het betaalaccount staat dicht: er komt nu geen bestelling binnen. Wat je moet doen staat in Te doen." : "Zonder werkende betaling komt er geen bestelling binnen.",
      klaar: s.betalen === null ? null : s.betalen,
      status: betalenStatus,
      href: "/admin/te-doen",
      knop: s.betalen === false ? "Wat moet ik doen?" : "Naar Te doen",
    },
    {
      id: "bestelling",
      titel: "Je eerste bestelling",
      uitleg: "Dan weet je dat alles werkt, van de winkel tot de betaling.",
      klaar: s.betaaldTotaal > 0,
      status: s.betaaldTotaal > 0 ? `${s.betaaldTotaal} betaalde bestelling${s.betaaldTotaal === 1 ? "" : "en"}` : "Nog geen betaalde bestelling",
      href: "/admin/shop?tab=orders",
      knop: "Bestellingen bekijken",
    },
  ];
}

/** "3 van 6 klaar": alleen echt gemeten stappen tellen als klaar. */
export function opzetVoortgang(stappen: OpzetStap[]): { klaar: number; totaal: number; tekst: string; allesKlaar: boolean } {
  const klaar = stappen.filter((s) => s.klaar === true).length;
  return { klaar, totaal: stappen.length, tekst: `${klaar} van ${stappen.length} klaar`, allesKlaar: klaar === stappen.length };
}

/** De eerstvolgende stap die nog niet klaar is (voor de nadruk); null als alles klaar is. */
export function volgendeStap(stappen: OpzetStap[]): OpzetStap | null {
  return stappen.find((s) => s.klaar !== true) ?? null;
}