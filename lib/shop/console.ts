// ---------------------------------------------------------------------------
// De Webshop-console (Beheer → Webshop & merk → Webshop-console, 13 nov 2026). De eigenaar: "ik heb geen beheerconsole zoals
// Wix en Shopify". Alles voor de webshop bestond al, maar verspreid over een tiental menu-items. Dit is één startpagina: hoe
// de webshop ervoor staat (alleen echte cijfers), wat er nu moet gebeuren, en een tegel naar elk onderdeel.
// Puur bestand: de regels voor "wat nu te doen" en de lijst met tegels. De cijfers haalt de pagina zelf op.
// ---------------------------------------------------------------------------

export interface ConsoleStand {
  /** kan de webshop betalingen ontvangen? null = nog niet gemeten */
  betalen: boolean | null;
  /** producten die klanten zien */
  zichtbaar: number;
  /** producten die uit staan (concepten en uitgezette producten) */
  uit: number;
  /** zichtbare producten zonder foto */
  zonderFoto: number;
  /** varianten van zichtbare producten met weinig voorraad (5 of minder) */
  lageVoorraad: number;
  /** bestelpogingen in de laatste 30 dagen, betaald of niet */
  pogingen30: number;
  /** betaalde bestellingen in de laatste 30 dagen */
  betaald30: number;
  /** omzet van die betaalde bestellingen, in centen */
  omzet30Cents: number;
}

export interface ConsoleTaak {
  id: string;
  titel: string;
  uitleg: string;
  href: string;
  knop: string;
  toon: "crit" | "warn" | "plan";
}

const aantal = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`;

/** Wat er nu moet gebeuren, het belangrijkste eerst. Een lege lijst = niets dat op de eigenaar wacht. */
export function consoleTaken(s: ConsoleStand): ConsoleTaak[] {
  const uit: ConsoleTaak[] = [];
  if (s.betalen === false) {
    uit.push({
      id: "betalen",
      titel: "Klanten kunnen niet betalen",
      uitleg: "Het betaalaccount bij Stripe staat dicht. Zolang dat zo is, komt er geen bestelling binnen, hoeveel producten er ook staan. Alleen jij kunt dit bij Stripe oplossen.",
      href: "/admin/te-doen",
      knop: "Naar Te doen",
      toon: "crit",
    });
  }
  if (s.zichtbaar === 0) {
    uit.push({ id: "leeg", titel: "Er staat geen enkel product zichtbaar", uitleg: "Klanten zien een lege webshop. Zet een product aan of maak er een.", href: "/admin/shop", knop: "Naar producten", toon: "crit" });
  }
  if (s.pogingen30 > 0 && s.betaald30 === 0) {
    uit.push({
      id: "geen-betaling",
      titel: `${aantal(s.pogingen30, "bestelpoging", "bestelpogingen")} in 30 dagen, geen enkele betaald`,
      uitleg: "Mensen begonnen te bestellen maar de betaling kwam niet rond. Kijk bij de bestellingen wat er misging.",
      href: "/admin/shop",
      knop: "Naar bestellingen",
      toon: "warn",
    });
  }
  if (s.zonderFoto > 0) {
    uit.push({ id: "foto", titel: `${aantal(s.zonderFoto, "zichtbaar product heeft", "zichtbare producten hebben")} geen foto`, uitleg: "Een product zonder foto verkoopt bijna niet. Zet er een echte foto bij.", href: "/admin/shop", knop: "Naar producten", toon: "warn" });
  }
  if (s.lageVoorraad > 0) {
    uit.push({ id: "voorraad", titel: `${aantal(s.lageVoorraad, "maat of kleur is", "maten of kleuren zijn")} bijna op`, uitleg: "Vijf stuks of minder op voorraad. De Winkel-AI maakt een lijst om te bestellen.", href: "/admin/shop-ai", knop: "Naar inkoop", toon: "warn" });
  }
  if (s.uit > 0) {
    uit.push({ id: "concepten", titel: `${aantal(s.uit, "product staat", "producten staan")} uit`, uitleg: "Concepten en uitgezette producten. Controleer naam, prijs en foto en zet aan wat je wilt verkopen.", href: "/admin/shop", knop: "Naar producten", toon: "plan" });
  }
  return uit;
}

export interface ConsoleTegel {
  titel: string;
  uitleg: string;
  href: string;
  /** opent de webshop zelf, in een nieuw tabblad */
  buiten?: true;
}

export interface ConsoleGroep {
  naam: string;
  uitleg: string;
  tegels: ConsoleTegel[];
}

/** Elk onderdeel van het webshopbeheer, per groep. Een test bewaakt dat elk adres bestaat. */
export const CONSOLE_GROEPEN: ConsoleGroep[] = [
  {
    naam: "Verkopen",
    uitleg: "Wat je verkoopt en wat er besteld is.",
    tegels: [
      { titel: "Producten", uitleg: "Toevoegen, aanpassen, prijzen, maten, kleuren, voorraad en foto's.", href: "/admin/shop" },
      { titel: "Bestellingen", uitleg: "Wat er besteld is, pakbon, verzonden melden en terugbetalen. Tabblad Bestellingen.", href: "/admin/shop" },
      { titel: "Kortingscodes en cijfers", uitleg: "Kortingscodes maken, lage voorraad en de verkoop in cijfers. Tabbladen Cijfers en Hulpmiddelen.", href: "/admin/shop" },
      { titel: "Bekijk je webshop", uitleg: "Zoals een klant hem ziet.", href: "/shop", buiten: true },
    ],
  },
  {
    naam: "Producten erbij met AI",
    uitleg: "Laat de AI het schrijfwerk doen. Een nieuw product staat altijd uit tot jij het aanzet.",
    tegels: [
      { titel: "Product van een link", uitleg: "Plak de link naar het product bij je leverancier: naam, omschrijving, foto en prijs worden gelezen.", href: "/admin/shop-ai" },
      { titel: "Product uit een idee", uitleg: "Beschrijf in gewone woorden wat je wilt verkopen; de AI maakt het product met een prijs uit je marge.", href: "/admin/shop-ai" },
      { titel: "Inkoop en trends", uitleg: "Een lijst van wat bijna op is, en wat er nu speelt met bronnen erbij.", href: "/admin/shop-ai" },
    ],
  },
  {
    naam: "Uiterlijk",
    uitleg: "Hoe je webshop eruitziet. Je sleept, kiest en ziet het in het voorbeeld.",
    tegels: [
      { titel: "De homepage van de webshop indelen", uitleg: "Sleep de onderdelen naar een andere plek of verberg ze.", href: "/admin/ontwerper?tab=shop" },
      { titel: "Alle teksten", uitleg: "Elke kop, knop en zin van de webshop aanpassen.", href: "/admin/ontwerper?tab=teksten" },
      { titel: "De foto in de kop en andere beelden", uitleg: "Foto's en video's uploaden en kiezen welke foto bovenaan de webshop staat. Onder Producten, blok Foto's en video's.", href: "/admin/shop" },
      { titel: "Kleuren, letters en knoppen", uitleg: "De stijl van de hele site, ook van de webshop.", href: "/admin/ontwerper?tab=stijl" },
    ],
  },
  {
    naam: "Meer verkopen",
    uitleg: "Anderen laten meeverkopen en je producten op meer plekken tonen.",
    tegels: [
      { titel: "Verkopers", uitleg: "Bedrijven die hun eigen producten in jouw webshop verkopen.", href: "/admin/verkopers" },
      { titel: "Partnerprogramma", uitleg: "Mensen die een deel verdienen als ze een klant aanbrengen.", href: "/admin/partners" },
      { titel: "Verkoop via AI-assistenten", uitleg: "Je producten vindbaar maken voor AI-assistenten die voor mensen winkelen.", href: "/admin/verkoop-via-ai" },
    ],
  },
];
