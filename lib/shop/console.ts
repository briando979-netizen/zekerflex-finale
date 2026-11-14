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
      { titel: "Bestellingen", uitleg: "Wat er besteld is, pakbon, verzonden melden en terugbetalen. Opent het tabblad Bestellingen.", href: "/admin/shop?tab=orders" },
      { titel: "Kortingscodes en cijfers", uitleg: "Kortingscodes maken en de lage voorraad bekijken. Opent het tabblad Kortingen & voorraad; de verkoop in cijfers staat bij Statistieken.", href: "/admin/shop?tab=tools" },
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

// ---- Mijn winkel: de zes grote knoppen bovenaan (14 nov 2026) ------------------------------------------------------------------
// De eigenaar: "mijn beheer van de webshop is echt niet goed, ik kan er niks mee". Dit is het startpunt: zes dingen die je met een webshop doet,
// in gewone woorden, elk één knop naar de goede plek. De 12 losse menu-items blijven bereikbaar; dit is de ingang.

export interface MijnWinkelKnop {
  id: "toevoegen" | "producten" | "bestellingen" | "bekijken" | "inrichten" | "betalen";
  titel: string;
  uitleg: string;
  href: string;
  /** opent de webshop zelf, in een nieuw tabblad */
  buiten?: true;
}

export const MIJN_WINKEL_KNOPPEN: MijnWinkelKnop[] = [
  { id: "toevoegen", titel: "Product toevoegen", uitleg: "Een nieuw product in je winkel zetten, met foto, naam en prijs.", href: "/admin/shop?nieuw=1" },
  { id: "producten", titel: "Producten", uitleg: "Je producten bekijken en aanpassen: prijs, voorraad en wat zichtbaar is.", href: "/admin/shop" },
  { id: "bestellingen", titel: "Bestellingen", uitleg: "Wat er besteld is, verzonden melden en terugbetalen.", href: "/admin/shop?tab=orders" },
  { id: "bekijken", titel: "Winkel bekijken", uitleg: "Je winkel zoals een klant hem ziet.", href: "/shop", buiten: true },
  { id: "inrichten", titel: "Winkel inrichten", uitleg: "De indeling, teksten en kleuren van je winkel aanpassen en meteen zien hoe het eruitziet.", href: "/admin/ontwerper?tab=shop" },
  { id: "betalen", titel: "Betalen", uitleg: "Of klanten kunnen betalen, en wat je moet doen als dat niet zo is.", href: "/admin/te-doen" },
];

/** De status op de knop Betalen, eerlijk: dicht zolang Stripe dat zegt, "nog niet gemeten" als dat zo is. */
export function betalenStatus(betalen: boolean | null): { tekst: string; toon: "ok" | "crit" | "neutral" } {
  if (betalen === null) return { tekst: "Nog niet gemeten", toon: "neutral" };
  return betalen ? { tekst: "Klanten kunnen betalen", toon: "ok" } : { tekst: "Dicht: klanten kunnen nu niet betalen", toon: "crit" };
}

// ---- Winkel inrichten: waar je wat aanpast (Mijn winkel, deel 5) --------------------------------------------------------------------
// De Site-ontwerper kan al alles hieronder, met een voorbeeld van je winkel ernaast en wat je klikt meteen zichtbaar. Dit is de korte weg
// ernaartoe, in gewone woorden: wat wil je aanpassen, en een knop naar het goede tabblad. Er is dus geen tweede editor gebouwd.
// Let op: de foto in de kop van /shop staat vast (de teamfoto in components/marketing/ShopThuis.tsx); wisselen kan nog niet vanuit een scherm.

export interface InrichtenKnop {
  id: "kop" | "indeling" | "kleuren" | "menu" | "teksten" | "beeld";
  titel: string;
  uitleg: string;
  href: string;
}

export const INRICHTEN_KNOPPEN: InrichtenKnop[] = [
  { id: "kop", titel: "Titel en ondertitel van je winkel", uitleg: "De grote kop bovenaan je winkel en de tekst eronder. Klik in het voorbeeld op de tekst die je wilt veranderen.", href: "/admin/ontwerper?tab=teksten" },
  { id: "indeling", titel: "Indeling van je winkel", uitleg: "Welke onderdelen er onder de kop staan en in welke volgorde: sleep ze naar een andere plek of verberg ze.", href: "/admin/ontwerper?tab=shop" },
  { id: "kleuren", titel: "Kleuren en letters", uitleg: "De stijl van je hele site, ook van de winkel.", href: "/admin/ontwerper?tab=stijl" },
  { id: "menu", titel: "Menu", uitleg: "De knoppen bovenaan je site.", href: "/admin/ontwerper?tab=menu" },
  { id: "teksten", titel: "Alle teksten, ook de voetnoot", uitleg: "Elke kop, knop en zin van de winkel aanpassen, ook onderaan de pagina.", href: "/admin/ontwerper?tab=teksten" },
  { id: "beeld", titel: "Foto's en video's", uitleg: "Je bibliotheek met beelden voor je site.", href: "/admin/ontwerper?tab=media" },
];
