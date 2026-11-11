import { slugify, type BetaalInstelling, type Block, type BlockProps, type BlockType, type BtwInstelling, type BtwTarief, type Company, type Item, type Kortingscode, type Page, type ProductOptie, type SiteProduct, type Theme, type Verzendmethode, type Winkel } from "@/lib/sites/types";
import { voorwaardenTekst, webshopTemplate } from "@/lib/sites/webshop-templates";
import { kortingTekst } from "@/lib/sites/winkel-korting";
import { leveringVan, prijsTekst } from "@/lib/sites/winkel-verzending";

// ---------------------------------------------------------------------------
// Voorbeeldwebshops per ontwerp (11 nov 2026, opdracht van de eigenaar: "richt die
// webshop volledig in zoals Wix en Shopify"). Voor elk ontwerp van Webshop openen
// (lib/sites/webshop-templates.ts) een complete winkel: producten met foto, prijs,
// categorie, maten en kleuren, een aanbieding en iets wat uitverkocht is, een
// homepagina met opening, uitgelichte producten en redenen om hier te kopen, en de
// pagina's die elke webwinkel heeft. Ook de instellingen van de winkel staan erin
// (verzendmethoden, een kortingscode, betalen en btw), zodat je het hele bestellen
// kunt proberen tot het moment van bestellen: een voorbeeld bestelt niets
// (SiteDoc.voorbeeld, lib/sites/bestellingen.ts). Elke winkel bestaat niet (de balk
// zegt het), heeft geen telefoon, e-mail of rekeningnummer (die zouden van iemand
// anders kunnen zijn), en reviews heten "voorbeeld". Foto's: Pexels (vrije licentie,
// public/voorbeeldsites/CREDITS.md), één keer opgehaald en bij ons bewaard
// (lib/sites/winkel-demo.ts). Adres: /site/voorbeeldwinkel-<ontwerp>.
// Puur: alleen gegevens en pagina's.
// ---------------------------------------------------------------------------

export interface WinkelFoto {
  /** het nummer van de foto op Pexels (pexelsUrl in lib/sites/branche-voorbeelden.ts) */
  pexels: number;
  alt: string;
}

export interface VoorbeeldProduct {
  /** kort en uniek in de winkel (a-z): het product-id is "pw" + de code van de winkel + de sleutel; de foto heet ook zo */
  sleutel: string;
  naam: string;
  categorie: string;
  /** in centen, zoals de winkel rekent (inclusief of exclusief btw, WinkelVoorbeeld.btw) */
  prijsCents: number;
  oudePrijsCents?: number | undefined;
  korteTekst: string;
  omschrijving: string;
  foto: WinkelFoto;
  opties?: ProductOptie[] | undefined;
  uitverkocht?: boolean | undefined;
  voorraad?: number | undefined;
  /** een ander tarief dan de winkel standaard rekent (de koffiemolen in een winkel met eten) */
  btw?: BtwTarief | undefined;
}

export interface WinkelVoorbeeld {
  /** het ontwerp (WEBSHOP_TEMPLATES) */
  id: string;
  /** drie letters, voor de nummers van producten en blokken */
  code: string;
  /** voorbeeldwinkel-<id> */
  slug: string;
  bedrijf: Company;
  /** wat de bezoeker van /voorbeeldsites ziet */
  omschrijving: string;
  hero: { kop: string; tekst: string; foto: WinkelFoto };
  over: { kop: string; tekst: string; lang: string; foto: WinkelFoto };
  /** de naam van de pagina met alle producten per categorie ("Assortiment", "Collectie") */
  assortiment: string;
  nieuw: { kop: string; tekst: string };
  usps: { kop: string; items: Item[] };
  uitgelicht: { sleutel: string; kop: string; tekst: string };
  reviews: string[];
  producten: VoorbeeldProduct[];
  verzendmethoden: Verzendmethode[];
  /** een zin onder de verzendmethoden: wanneer het pakket de deur uit gaat */
  verzendExtra: string;
  faq: { vraag: string; antwoord: string }[];
  korting: Kortingscode;
  btw: BtwInstelling;
  betaalTekst: string;
  uren: { kop: string; regels: { dag: string; tijd: string }[] };
  contact: { kop: string; tekst: string };
}

export const WINKEL_VOORBEELD_VOORVOEGSEL = "voorbeeldwinkel-";
export const winkelVoorbeeldSlug = (ontwerp: string) => `${WINKEL_VOORBEELD_VOORVOEGSEL}${ontwerp}`;
/** De kaartfoto van een voorbeeldwebshop: de openingsfoto, klein, van onze eigen server (app/(marketing)/voorbeeldsites/foto/[id]/route.ts). */
export const winkelVoorbeeldKaartfoto = (ontwerp: string) => `/voorbeeldsites/foto/${ontwerp}`;

const PLAATS = "Zonnedorp";
const bedrijf = (naam: string): Company => ({ naam, kvk: "", straat: "", postcode: "", plaats: PLAATS, telefoon: "", email: "" });

/** Betalen zonder rekeningnummer: bij het afhalen, of contant aan de bezorger (lib/sites/winkel-betalen.ts). */
const BETALEN: BetaalInstelling = { methoden: ["afhalen", "rembours"], iban: "", tenaamstelling: "" };
const BTW_HOOG: BtwInstelling = { inclusief: true, standaard: 21, kor: false };

function methode(id: string, soort: Verzendmethode["soort"], naam: string, prijsCents: number, gratisVanafCents: number | null, levertijd: string, gebied: Verzendmethode["gebied"] = "nl"): Verzendmethode {
  return { id, soort, naam, prijsCents, gratisVanafCents, gebied, adres: "", levertijd, actief: true };
}

const korting = (id: string, code: string, soort: Kortingscode["soort"], waarde: number, minimumCents: number | null): Kortingscode => ({ id, code, soort, waarde, minimumCents, totEnMet: null, maxGebruik: null, actief: true });

const maten = (...waarden: string[]): ProductOptie => ({ naam: "Maat", waarden });
const kleuren = (...waarden: string[]): ProductOptie => ({ naam: "Kleur", waarden });
const KLEDINGMATEN = ["XS", "S", "M", "L", "XL"];

export const WINKEL_VOORBEELDEN: WinkelVoorbeeld[] = [
  {
    id: "algemeen",
    code: "alg",
    slug: winkelVoorbeeldSlug("algemeen"),
    bedrijf: bedrijf("Allerlei Zonnedorp"),
    omschrijving: "Allround webwinkel met handige spullen voor thuis en onderweg: drie categorieën, kleuren om uit te kiezen, een aanbieding, een kortingscode en verzenden naar de hele EU.",
    hero: {
      kop: "Handige spullen voor thuis en onderweg",
      tekst: "Van een thermosfles die de hele dag warm houdt tot een snijplank voor jaren. Zorgvuldig gekozen en snel verstuurd vanuit Zonnedorp.",
      foto: { pexels: 27693158, alt: "Een plank in de keuken met glazen potten en gestapelde witte mokken" },
    },
    over: {
      kop: "Een winkel vol dingen die we zelf gebruiken",
      tekst: "Allerlei begon als een kraam op de markt van Zonnedorp. Nu verkopen we vooral online, maar de regel is hetzelfde gebleven: we verkopen alleen wat we zelf graag gebruiken.",
      lang: "Allerlei begon als een kraam op de markt van Zonnedorp, met mokken, potten en een paar rugzakken. Nu verkopen we vooral online, maar de regel is hetzelfde gebleven: we verkopen alleen wat we zelf graag gebruiken.\n\nAlles wat we verkopen hebben we eerst zelf een tijd geprobeerd. Gaat iets snel stuk of valt het tegen, dan gaat het uit de winkel.",
      foto: { pexels: 7674983, alt: "Twee vrouwen pakken bestellingen in kartonnen dozen in" },
    },
    assortiment: "Assortiment",
    nieuw: { kop: "Nieuw in de winkel", tekst: "Vandaag besteld, morgen in huis of klaar om af te halen." },
    usps: {
      kop: "Waarom bij Allerlei kopen",
      items: [
        { titel: "Snel in huis", tekst: "Voor 15.00 uur besteld, volgende werkdag verzonden. Vanaf € 50 gratis." },
        { titel: "14 dagen bedenktijd", tekst: "Past het niet? Stuur het terug, binnen 14 dagen." },
        { titel: "Gewoon een mens", tekst: "Vragen over je bestelling? Je krijgt echt antwoord." },
      ],
    },
    uitgelicht: { sleutel: "rugzak", kop: "Aanbieding van de week", tekst: "Onze canvas rugzak is deze week € 10 goedkoper." },
    reviews: ["Snel geleverd en netjes ingepakt. De thermosfles houdt mijn koffie echt de hele ochtend warm.", "Fijne winkel met spullen die lang meegaan. Mijn vraag over een retour was binnen een uur beantwoord."],
    producten: [
      {
        sleutel: "thermos",
        naam: "Thermosfles van rvs, 500 ml",
        categorie: "Onderweg",
        prijsCents: 2495,
        korteTekst: "Houdt koffie of thee urenlang warm",
        omschrijving: "Een dubbelwandige fles van roestvrij staal die drinken tot twaalf uur warm en tot een dag koud houdt. De dop sluit lekvrij, dus hij kan gewoon in je tas.\n\nInhoud 500 ml. Met de hand afwassen.",
        foto: { pexels: 29307238, alt: "Een thermosfles van rvs met open dop op een houten tafel in het bos" },
        opties: [kleuren("Zilver", "Zwart", "Mintgroen")],
        voorraad: 14,
      },
      {
        sleutel: "waterfles",
        naam: "Glazen waterfles met bamboe dop",
        categorie: "Onderweg",
        prijsCents: 1695,
        korteTekst: "Van glas, dus geen bijsmaak",
        omschrijving: "Een stevige fles van borosilicaatglas met een dop van bamboe. Glas houdt geen geur of smaak vast, dus je water smaakt altijd fris.\n\nInhoud 550 ml. De fles mag in de vaatwasser, de dop niet.",
        foto: { pexels: 6104536, alt: "Een glazen waterfles met een dop van bamboe in een veld met lavendel" },
      },
      {
        sleutel: "rugzak",
        naam: "Canvas rugzak",
        categorie: "Onderweg",
        prijsCents: 5995,
        oudePrijsCents: 6995,
        korteTekst: "Stevig canvas met leren details",
        omschrijving: "Een ruime rugzak van gewassen canvas met een vak voor je laptop (tot 15 inch), een voorvak en verstelbare schouderbanden. Hij wordt mooier naarmate je hem langer gebruikt.\n\nInhoud ongeveer 20 liter.",
        foto: { pexels: 9088788, alt: "Een bruine canvas rugzak hangt aan een boomstam in het bos" },
      },
      {
        sleutel: "kleed",
        naam: "Picknickkleed met strepen",
        categorie: "Onderweg",
        prijsCents: 3495,
        korteTekst: "Zacht katoen met een waterdichte onderkant",
        omschrijving: "Een groot kleed van 150 bij 200 cm voor in het park of op het strand. De onderkant houdt het vocht van het gras tegen, en opgerold draag je hem aan het handvat.\n\nWassen op 30 graden.",
        foto: { pexels: 17504246, alt: "Een gestreept kleed op het gras in een park, met een boek erop" },
        uitverkocht: true,
      },
      {
        sleutel: "paraplu",
        naam: "Stormparaplu",
        categorie: "Onderweg",
        prijsCents: 2495,
        korteTekst: "Buigt mee met de wind en klapt niet om",
        omschrijving: "Een paraplu met een flexibel frame dat meebuigt met de wind en daarna weer terugveert. Gaat met één druk op de knop open.\n\nDoorsnede 100 cm.",
        foto: { pexels: 5052681, alt: "Een zwarte paraplu vol regendruppels" },
      },
      {
        sleutel: "mok",
        naam: "Emaille mok",
        categorie: "Keuken",
        prijsCents: 1250,
        korteTekst: "Licht, onbreekbaar en altijd mee",
        omschrijving: "Een klassieke mok van geëmailleerd staal. Licht genoeg voor op de camping, mooi genoeg voor op tafel.\n\nInhoud 350 ml. Niet in de magnetron.",
        foto: { pexels: 6312272, alt: "Twee gestapelde witte emaille mokken op een houten tafel" },
        opties: [kleuren("Wit", "Blauw")],
      },
      {
        sleutel: "snijplank",
        naam: "Houten snijplank",
        categorie: "Keuken",
        prijsCents: 2995,
        korteTekst: "Massief eikenhout, gaat jaren mee",
        omschrijving: "Een dikke snijplank van massief eikenhout, met een sapgootje aan één kant. Vet hem af en toe in met wat olie, dan blijft hij mooi.\n\n40 bij 25 cm.",
        foto: { pexels: 6653923, alt: "Houten snijplanken in een keukenhoek naast een pan en een plant" },
      },
      {
        sleutel: "voorraadpot",
        naam: "Voorraadpot met bamboe deksel",
        categorie: "Keuken",
        prijsCents: 995,
        korteTekst: "Houdt koffie, pasta en noten droog",
        omschrijving: "Een glazen pot met een deksel van bamboe dat met een ring van siliconen luchtdicht sluit. Mooi op het aanrecht en handig in de kast.\n\nInhoud 1 liter.",
        foto: { pexels: 4856953, alt: "Een voorraadpot met een deksel van bamboe op een onderzetter van kurk" },
        voorraad: 3,
      },
      {
        sleutel: "cafetiere",
        naam: "Cafetière, 1 liter",
        categorie: "Keuken",
        prijsCents: 2995,
        korteTekst: "Koffie zetten zonder apparaat",
        omschrijving: "Koffie zoals het hoort: grof gemalen koffie, heet water, vier minuten wachten en dan drukken. Van hittebestendig glas in een frame van rvs.\n\nGenoeg voor acht kopjes.",
        foto: { pexels: 12247242, alt: "Een cafetière vol koffie op een houten tafel" },
      },
      {
        sleutel: "notitieboek",
        naam: "Notitieboek A5 met harde kaft",
        categorie: "Thuis en werk",
        prijsCents: 1495,
        korteTekst: "160 bladzijden, gelinieerd",
        omschrijving: "Een notitieboek met een stevige kaft, een leeslint en papier waar je pen niet doorheen drukt. Voor lijstjes, plannen en alles wat je niet wilt vergeten.",
        foto: { pexels: 3622342, alt: "Notitieboeken met een harde kaft in verschillende kleuren op een houten tafel" },
        opties: [kleuren("Oker", "Groen", "Rood", "Blauw")],
      },
      {
        sleutel: "wekker",
        naam: "Wekker met wijzers",
        categorie: "Thuis en werk",
        prijsCents: 1995,
        korteTekst: "Tikt niet, met een lampje",
        omschrijving: "Een wekker met een stil uurwerk, dus je hoort hem niet tikken. Met een knop zet je het lampje aan om in het donker de tijd te zien.\n\nWerkt op één AA-batterij (niet meegeleverd).",
        foto: { pexels: 32815277, alt: "Een blauwe wekker met wijzers op een houten tafel" },
        opties: [kleuren("Blauw", "Wit")],
      },
    ],
    verzendmethoden: [
      methode("vwafhalen", "afhalen", "Afhalen in de winkel in Zonnedorp", 0, null, "De volgende werkdag klaar"),
      methode("vwpakket", "bezorgen", "Pakket aan huis", 495, 5000, "1 tot 2 werkdagen"),
      methode("vweuropa", "bezorgen", "Pakket naar België en de rest van de EU", 995, 10000, "3 tot 5 werkdagen", "eu"),
    ],
    verzendExtra: "Bestellingen die we voor 15.00 uur op een werkdag ontvangen, gaan dezelfde dag de deur uit.",
    faq: [
      { vraag: "Wanneer komt mijn bestelling?", antwoord: "Voor 15.00 uur besteld op een werkdag, dan gaat je pakket dezelfde dag de deur uit en heb je het in Nederland meestal de volgende werkdag." },
      { vraag: "Kan ik mijn bestelling ophalen?", antwoord: "Ja, kies bij het bestellen voor afhalen. De volgende werkdag ligt hij voor je klaar in onze winkel in Zonnedorp." },
      { vraag: "Hoe gebruik ik een kortingscode?", antwoord: "Vul de code in bij het bestellen. Je ziet de korting meteen in het overzicht, voordat je de bestelling plaatst." },
    ],
    korting: korting("kwwelkom", "WELKOM10", "procent", 10, 2500),
    btw: BTW_HOOG,
    betaalTekst: "Je betaalt bij het afhalen in de winkel, of contant aan de bezorger.",
    uren: {
      kop: "Klantenservice en winkel",
      regels: [
        { dag: "Maandag t/m vrijdag", tijd: "09:00 – 17:00" },
        { dag: "Zaterdag", tijd: "10:00 – 16:00" },
        { dag: "Zondag", tijd: "Gesloten" },
      ],
    },
    contact: { kop: "Een vraag over je bestelling?", tekst: "Stuur ons een bericht, dan antwoorden we binnen een werkdag. Zet je bestelnummer erbij als je dat hebt." },
  },
  {
    id: "mode",
    code: "mod",
    slug: winkelVoorbeeldSlug("mode"),
    bedrijf: bedrijf("Linnen & Wol"),
    omschrijving: "Modewinkel voor dames en heren: maten en kleuren kiezen, een maattabel bij de kleding, accessoires, een aanbieding en een jas die uitverkocht is.",
    hero: {
      kop: "Kleding van natuurlijke stoffen, gemaakt om lang te dragen",
      tekst: "Linnen voor de zomer, wol voor de winter. Tijdloze stukken in rustige kleuren, met bij elk product een maattabel.",
      foto: { pexels: 5865196, alt: "Een rek met kleding en accessoires in een kleine modewinkel" },
    },
    over: {
      kop: "Minder kopen, beter kiezen",
      tekst: "Linnen & Wol is een kleine modewinkel uit Zonnedorp. We kiezen kleding van linnen, katoen en wol die je jaren draagt, en vertellen eerlijk hoe iets valt.",
      lang: "We begonnen met één rek linnen blouses in een hoekje van een winkel. Nu verkopen we een kleine, vaste collectie voor dames en heren, met accessoires van leer en zijde.\n\nBij elk product staat hoe het valt en welke maat je kiest. Twijfel je? Stuur ons een bericht, dan denken we mee. Of kom passen: afhalen kan in de winkel in Zonnedorp.",
      foto: { pexels: 7289742, alt: "Een vrouw pakt een geruit overhemd in vloeipapier in" },
    },
    assortiment: "Collectie",
    nieuw: { kop: "Nieuw binnen", tekst: "De stukken die nu het meest gedragen worden." },
    usps: {
      kop: "Waarom bij Linnen & Wol",
      items: [
        { titel: "Pasvorm uitgelegd", tekst: "Bij elk product staat hoe het valt, met een maattabel. Dat scheelt retour." },
        { titel: "14 dagen bedenktijd", tekst: "Past het niet? Binnen 14 dagen terug." },
        { titel: "Passen in de winkel", tekst: "Kies afhalen, dan pas je het eerst in de winkel in Zonnedorp." },
      ],
    },
    uitgelicht: { sleutel: "trui", kop: "Favoriet van dit seizoen", tekst: "Onze trui van merinowol, nu met korting." },
    reviews: ["De linnen blouse valt precies zoals beschreven. Fijn dat er een maattabel bij staat.", "Mijn trui was in twee dagen in huis, mooi verpakt in papier. Hij kriebelt echt niet."],
    producten: [
      {
        sleutel: "blouse",
        naam: "Linnen blouse",
        categorie: "Dames",
        prijsCents: 6995,
        korteTekst: "Luchtig linnen, iets ruimer gesneden",
        omschrijving: "Een blouse van gewassen linnen die zacht aanvoelt vanaf de eerste keer dragen. Iets ruimer gesneden, met kleine parelmoeren knoopjes.\n\nValt normaal: kies je eigen maat. Maattabel (borstomvang): XS 82–86 cm · S 86–90 cm · M 90–94 cm · L 94–98 cm · XL 98–102 cm.\n\n100% linnen. Wassen op 30 graden.",
        foto: { pexels: 22441297, alt: "Een linnen overhemd aan een houten hanger tegen een lichte achtergrond" },
        opties: [maten(...KLEDINGMATEN), kleuren("Zand", "Wit")],
      },
      {
        sleutel: "jurk",
        naam: "Zomerjurk met bloemenprint",
        categorie: "Dames",
        prijsCents: 8995,
        korteTekst: "Soepele viscose, tot net over de knie",
        omschrijving: "Een lichte jurk met een kleine bloemenprint, een V-hals en een ceintuur om te strikken. Draagt fijn op warme dagen.\n\nValt normaal. Maattabel (borstomvang): XS 82–86 cm · S 86–90 cm · M 90–94 cm · L 94–98 cm · XL 98–102 cm.\n\n100% viscose. Binnenstebuiten wassen op 30 graden.",
        foto: { pexels: 16427119, alt: "Een jurk met bloemenprint aan een hanger bij een raam met planten" },
        opties: [maten(...KLEDINGMATEN)],
      },
      {
        sleutel: "trui",
        naam: "Trui van merinowol",
        categorie: "Dames",
        prijsCents: 9995,
        oudePrijsCents: 11995,
        korteTekst: "Warm en zacht, en kriebelt niet",
        omschrijving: "Een fijngebreide trui van merinowol die warm houdt zonder dik te zijn. Merinowol ademt en kriebelt niet, dus je draagt hem ook gewoon op je huid.\n\nValt normaal. Met de hand of in het wolprogramma wassen, liggend laten drogen.",
        foto: { pexels: 5710046, alt: "Een stapel opgevouwen gebreide truien in zachte kleuren" },
        opties: [maten(...KLEDINGMATEN), kleuren("Ecru", "Camel", "Grijs")],
        voorraad: 6,
      },
      {
        sleutel: "trenchcoat",
        naam: "Trenchcoat",
        categorie: "Dames",
        prijsCents: 16995,
        korteTekst: "De klassieker, met ceintuur",
        omschrijving: "Een tijdloze trenchcoat van stevig katoen die wind en een bui tegenhoudt. Met ceintuur, schouderstukken en diepe zakken.\n\nValt ruim: twijfel je tussen twee maten, kies dan de kleinste.",
        foto: { pexels: 19192235, alt: "Een vrouw in een trenchcoat met ceintuur, van dichtbij" },
        opties: [maten(...KLEDINGMATEN)],
        uitverkocht: true,
      },
      {
        sleutel: "overhemd",
        naam: "Linnen overhemd",
        categorie: "Heren",
        prijsCents: 7995,
        korteTekst: "Fris linnen voor kantoor en terras",
        omschrijving: "Een overhemd van linnen met een button-down kraag. Netjes onder een colbert, ontspannen met de mouwen opgestroopt.\n\nValt normaal. Maattabel (borstomvang): S 94–98 cm · M 98–102 cm · L 102–106 cm · XL 106–110 cm · XXL 110–116 cm.\n\n100% linnen. Wassen op 30 graden.",
        foto: { pexels: 17281873, alt: "Een rij witte overhemden aan houten hangers in een winkel" },
        opties: [maten("S", "M", "L", "XL", "XXL"), kleuren("Wit", "Lichtblauw")],
      },
      {
        sleutel: "jeans",
        naam: "Jeans met rechte pijp",
        categorie: "Heren",
        prijsCents: 8995,
        korteTekst: "Stevig denim dat met je meegroeit",
        omschrijving: "Een jeans van stevig katoen met een rechte pijp en een normale taille. Het denim wordt zachter en mooier naarmate je hem draagt.\n\nBinnenbeenlengte 32 inch. Valt normaal: kies je gewone maat.",
        foto: { pexels: 4109797, alt: "Een stapel opgevouwen blauwe spijkerbroeken" },
        opties: [maten("W30", "W31", "W32", "W33", "W34", "W36")],
      },
      {
        sleutel: "sneakers",
        naam: "Leren sneakers",
        categorie: "Schoenen",
        prijsCents: 11995,
        korteTekst: "Wit leer op een stevige rubberen zool",
        omschrijving: "Strakke sneakers van glad wit leer met een stevige rubberen zool. Passen onder een jurk én onder een pak.\n\nVallen normaal. Maak het leer schoon met een vochtige doek.",
        foto: { pexels: 7193626, alt: "Witte sneakers op een lichte houten vloer" },
        opties: [maten("36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46")],
      },
      {
        sleutel: "tas",
        naam: "Leren schoudertas",
        categorie: "Accessoires",
        prijsCents: 12995,
        korteTekst: "Groot genoeg voor alles, licht om te dragen",
        omschrijving: "Een tas van zacht rundleer met een verstelbare schouderband, een rits en een binnenvak voor je telefoon. Het leer krijgt na verloop van tijd een mooie glans.\n\n32 bij 24 bij 10 cm.",
        foto: { pexels: 10919291, alt: "Een bruine leren handtas tegen een lichte achtergrond" },
        opties: [kleuren("Cognac", "Zwart")],
        voorraad: 2,
      },
      {
        sleutel: "sjaal",
        naam: "Zijden sjaal",
        categorie: "Accessoires",
        prijsCents: 4995,
        korteTekst: "Een grafische print in warme kleuren",
        omschrijving: "Een vierkante sjaal van zijde met een print in oranje, blauw en goud. Om je hals, aan je tas of in je haar.\n\n90 bij 90 cm. Met de hand wassen of laten stomen.",
        foto: { pexels: 36455708, alt: "Een zijden sjaal met een grafisch patroon in oranje, blauw en goud" },
      },
      {
        sleutel: "riem",
        naam: "Leren riem",
        categorie: "Accessoires",
        prijsCents: 3995,
        korteTekst: "Volnerf leer met een eenvoudige gesp",
        omschrijving: "Een riem van stevig volnerf leer, 3,5 cm breed, met een eenvoudige metalen gesp.\n\nKies de maat van je broek: bij maat 90 is de riem van de gesp tot het middelste gaatje 90 cm.",
        foto: { pexels: 6654763, alt: "Bruine leren riem met een koperen gesp, in twee handen" },
        opties: [maten("85 cm", "90 cm", "95 cm", "100 cm", "105 cm"), kleuren("Zwart", "Cognac", "Grijs")],
      },
      {
        sleutel: "muts",
        naam: "Gebreide muts",
        categorie: "Accessoires",
        prijsCents: 2495,
        oudePrijsCents: 2995,
        korteTekst: "Wol met een brede omslag",
        omschrijving: "Een warme muts van zachte wol met een brede omslag, die je hoog of laag draagt. Eén maat die meerekt.",
        foto: { pexels: 33258846, alt: "Gebreide mutsen in aardetinten naast elkaar" },
        opties: [kleuren("Zand", "Bruin", "Grijs")],
      },
    ],
    verzendmethoden: [
      methode("vwafhalen", "afhalen", "Afhalen en passen in de winkel", 0, null, "De volgende werkdag klaar"),
      methode("vwpakket", "bezorgen", "Pakket aan huis", 495, 7500, "1 tot 2 werkdagen"),
      methode("vweuropa", "bezorgen", "Pakket naar België en de rest van de EU", 1295, 15000, "3 tot 5 werkdagen", "eu"),
    ],
    verzendExtra: "Voor 15.00 uur besteld op een werkdag, dan is je pakket dezelfde dag onderweg. We verpakken alles in papier, zonder plastic.",
    faq: [
      { vraag: "Welke maat moet ik kiezen?", antwoord: "Bij elk product staat hoe het valt en een maattabel. Twijfel je tussen twee maten, stuur ons dan een bericht met je lengte en de maat die je meestal draagt." },
      { vraag: "Kan ik iets ruilen voor een andere maat?", antwoord: "Ja, binnen 14 dagen. Meld het ons, stuur het artikel terug en bestel de andere maat; je krijgt je geld voor het eerste artikel terug." },
      { vraag: "Kan ik eerst passen?", antwoord: "Ja, kies bij het bestellen voor afhalen. Dan pas je het in de winkel en betaal je alleen wat je meeneemt." },
    ],
    korting: korting("kwnieuw", "NIEUW15", "procent", 15, 7500),
    btw: BTW_HOOG,
    betaalTekst: "Je betaalt bij het afhalen in de winkel, of contant aan de bezorger.",
    uren: {
      kop: "Winkel en klantenservice",
      regels: [
        { dag: "Maandag", tijd: "Gesloten" },
        { dag: "Dinsdag t/m vrijdag", tijd: "10:00 – 18:00" },
        { dag: "Zaterdag", tijd: "10:00 – 17:00" },
        { dag: "Zondag", tijd: "Gesloten" },
      ],
    },
    contact: { kop: "Vragen over een maat of je bestelling?", tekst: "Stuur ons een bericht, we antwoorden binnen een werkdag. Voor advies over een maat helpt het als je je lengte en je gewone maat erbij zet." },
  },
  {
    id: "eten",
    code: "eet",
    slug: winkelVoorbeeldSlug("eten"),
    bedrijf: bedrijf("De Smaakschuur"),
    omschrijving: "Delicatessenwinkel met koffie, thee en lekkers: 9 procent btw op eten en 21 procent op de koffiemolen, bij elk product wat erin zit, en afhalen, bezorgen in het dorp of een pakket.",
    hero: {
      kop: "Koffie, thee en lekkers van kleine makers",
      tekst: "Vers gebrande koffie, losse thee, honing van de imker om de hoek en koekjes uit eigen oven. Met zorg verpakt in Zonnedorp.",
      foto: { pexels: 3850382, alt: "Croissants, potjes jam en een koffiepot op een linnen doek" },
    },
    over: {
      kop: "Een schuur vol smaak",
      tekst: "De Smaakschuur zit in een oude graanschuur aan de rand van Zonnedorp. We branden onze eigen koffie en verkopen wat kleine makers uit de buurt maken.",
      lang: "Elke donderdag branden we koffie, in kleine porties, zodat hij vers bij je aankomt. Daarnaast verkopen we thee, honing, jam en koekjes van makers die we persoonlijk kennen.\n\nBij elk product staat wat erin zit. Heb je een allergie en twijfel je? Vraag het ons, dan zoeken we het voor je uit.",
      foto: { pexels: 7541875, alt: "Iemand met een bruin schort houdt een zak koffiebonen vast in een koffiezaak" },
    },
    assortiment: "Assortiment",
    nieuw: { kop: "Vers in de schuur", tekst: "Bestel vandaag en haal het op, of laat het bezorgen." },
    usps: {
      kop: "Waarom bij De Smaakschuur",
      items: [
        { titel: "Vers verpakt", tekst: "Koffie elke week vers gebrand, koekjes uit eigen oven." },
        { titel: "Afhalen of bezorgen", tekst: "Haal het zelf op in Zonnedorp, of laat het bezorgen. Op vrijdag rijden we zelf door het dorp." },
        { titel: "Allergieën duidelijk", tekst: "Per product staat wat erin zit." },
      ],
    },
    uitgelicht: { sleutel: "koffie", kop: "Elke donderdag vers gebrand", tekst: "Onze eigen huismelange: hele bonen of gemalen zoals jij koffie zet." },
    reviews: ["De koffie ruik je al als je de doos openmaakt. Op vrijdag bezorgd, precies zoals beloofd.", "Het cadeaupakket was een groot succes bij mijn moeder. Mooi verpakt, en alles even lekker."],
    producten: [
      {
        sleutel: "koffie",
        naam: "Koffiebonen huismelange, 500 gram",
        categorie: "Koffie en thee",
        prijsCents: 1395,
        korteTekst: "Vol en zacht, met een vleugje chocolade",
        omschrijving: "Onze eigen melange van bonen uit Brazilië en Ethiopië, elke donderdag vers gebrand. Vol van smaak, met een zachte afdronk die doet denken aan chocolade.\n\nKies hele bonen, of laat ons malen voor jouw manier van koffiezetten.\n\nBevat geen allergenen.",
        foto: { pexels: 7657837, alt: "Vers gebrande koffiebonen in een witte zak, van bovenaf" },
        opties: [{ naam: "Maling", waarden: ["Hele bonen", "Grof, voor de cafetière", "Filter", "Espresso"] }],
      },
      {
        sleutel: "groenethee",
        naam: "Groene thee, 100 gram",
        categorie: "Koffie en thee",
        prijsCents: 795,
        korteTekst: "Losse thee, fris en licht",
        omschrijving: "Losse groene thee met een frisse, lichte smaak. Zet hem met water van zo'n 80 graden en laat hem twee tot drie minuten trekken.\n\nGenoeg voor ongeveer 50 koppen. Bevat geen allergenen.",
        foto: { pexels: 8329977, alt: "Losse groene thee in een glazen pot met een houten lepel" },
      },
      {
        sleutel: "kruidenthee",
        naam: "Kruidenthee, 75 gram",
        categorie: "Koffie en thee",
        prijsCents: 695,
        korteTekst: "Zonder cafeïne, voor elk moment",
        omschrijving: "Losse kruidenthee zonder cafeïne, gemengd door een kleine theemakerij. Munt voor na het eten, kamille voor de avond en rooibos voor elke dag.\n\nBevat geen allergenen.",
        foto: { pexels: 28513378, alt: "Verschillende soorten losse kruidenthee op houten lepels" },
        opties: [{ naam: "Smaak", waarden: ["Munt", "Kamille", "Rooibos"] }],
      },
      {
        sleutel: "molen",
        naam: "Koffiemolen van hout",
        categorie: "Koffie en thee",
        prijsCents: 3995,
        korteTekst: "Met de hand malen, van grof tot fijn",
        omschrijving: "Een handkoffiemolen van hout met een maalwerk van staal. Met het schroefje bovenop stel je de maling in, van grof voor de cafetière tot fijn voor espresso.\n\nLet op: op deze molen zit 21% btw, op eten en drinken 9%. Bij het afrekenen zie je dat netjes apart.",
        foto: { pexels: 28613078, alt: "Een ouderwetse houten koffiemolen op een houten tafel" },
        btw: 21,
        voorraad: 4,
      },
      {
        sleutel: "chocolade",
        naam: "Pure chocolade 72%, 100 gram",
        categorie: "Zoet",
        prijsCents: 425,
        korteTekst: "Bitter en vol, niet te zoet",
        omschrijving: "Een reep pure chocolade van een kleine chocolatier, met cacao uit Peru. Bitter en vol, met een zachte afdronk.\n\nBevat: soja. Kan sporen bevatten van melk en noten.",
        foto: { pexels: 6167328, alt: "Een reep pure chocolade op verfrommeld wit papier" },
      },
      {
        sleutel: "honing",
        naam: "Bloemenhoning, 450 gram",
        categorie: "Zoet",
        prijsCents: 895,
        korteTekst: "Van een imker uit de buurt",
        omschrijving: "Romige bloemenhoning van bijen die rond Zonnedorp vliegen. Lekker op brood, door de yoghurt of in de thee.\n\nNiet geschikt voor kinderen jonger dan een jaar.",
        foto: { pexels: 9105966, alt: "Twee potten honing op een houten dienblad met een honinglepel" },
      },
      {
        sleutel: "koekjes",
        naam: "Roomboterkoekjes, 250 gram",
        categorie: "Zoet",
        prijsCents: 695,
        korteTekst: "Uit eigen oven, met echte roomboter",
        omschrijving: "Knapperige koekjes met echte roomboter en een snufje zeezout, elke week vers gebakken in onze eigen keuken.\n\nBevat: tarwe (gluten), melk, ei.",
        foto: { pexels: 797761, alt: "Vers gebakken roomboterkoekjes op een rooster" },
        uitverkocht: true,
      },
      {
        sleutel: "jam",
        naam: "Aardbeienjam, 320 gram",
        categorie: "Zoet",
        prijsCents: 595,
        korteTekst: "Met hele stukken aardbei",
        omschrijving: "Jam van aardbeien uit de streek, in kleine pannen gekookt met minder suiker dan gewoonlijk. Na openen in de koelkast bewaren.\n\nBevat geen allergenen.",
        foto: { pexels: 26727860, alt: "Een pot zelfgemaakte aardbeienjam met verse aardbeien op een houten plank" },
      },
      {
        sleutel: "olijfolie",
        naam: "Olijfolie extra vierge, 500 ml",
        categorie: "Voorraadkast",
        prijsCents: 1595,
        korteTekst: "Koud geperst, fruitig en een tikje pittig",
        omschrijving: "Olijfolie van één olijfgaard op Kreta, koud geperst. Fruitig met een pittige afdronk: lekker over salade en groente, of gewoon met brood.\n\nBevat geen allergenen.",
        foto: { pexels: 25745504, alt: "Een fles olijfolie met olijven en olijftakjes op een houten plank" },
      },
      {
        sleutel: "granola",
        naam: "Granola met noten, 400 gram",
        categorie: "Voorraadkast",
        prijsCents: 750,
        oudePrijsCents: 895,
        korteTekst: "Krokant, met honing en hazelnoten",
        omschrijving: "Krokante granola met havervlokken, hazelnoten, amandelen en een beetje honing, geroosterd in onze eigen oven.\n\nBevat: haver (gluten), hazelnoten, amandelen.",
        foto: { pexels: 4397282, alt: "Een pot krokante granola op een houten tafel, van bovenaf" },
      },
      {
        sleutel: "cadeau",
        naam: "Cadeaupakket Zoet",
        categorie: "Cadeaus",
        prijsCents: 2995,
        korteTekst: "Koekjes, chocolade, honing en jam in één doos",
        omschrijving: "Een feestelijk verpakte doos met roomboterkoekjes, een reep pure chocolade, bloemenhoning en aardbeienjam. Kies of je er een kaartje bij wilt; je tekst zet je bij de opmerking.\n\nBevat: tarwe (gluten), melk, ei, soja.",
        foto: { pexels: 28769885, alt: "Een cadeaudoos met koekjes en zoetigheden" },
        opties: [{ naam: "Kaartje", waarden: ["Zonder kaartje", "Met kaartje"] }],
      },
    ],
    verzendmethoden: [
      methode("vwafhalen", "afhalen", "Afhalen in De Smaakschuur", 0, null, "Dezelfde dag klaar"),
      methode("vwdorp", "bezorgen", "Bezorgen in Zonnedorp", 250, 2500, "Op vrijdag"),
      methode("vwpakket", "bezorgen", "Pakket aan huis", 595, 4500, "1 tot 2 werkdagen"),
    ],
    verzendExtra: "Pakketten gaan van maandag tot en met woensdag de deur uit, zodat niets in het weekend in een magazijn ligt. Koffie malen we op de dag van verzenden.",
    faq: [
      { vraag: "Hoe vers is de koffie?", antwoord: "We branden elke donderdag. Wat je bestelt, is hooguit een week oud als het de deur uit gaat." },
      { vraag: "Waarom staat er bij de molen een ander btw-tarief?", antwoord: "Op eten en drinken is de btw 9%, op spullen zoals een koffiemolen 21%. Bij het afrekenen zie je beide tarieven apart." },
      { vraag: "Kan ik een cadeau rechtstreeks laten bezorgen?", antwoord: "Ja, vul bij het bestellen het adres van de ontvanger in en zet je kaarttekst bij de opmerking." },
    ],
    korting: korting("kwproef", "PROEF5", "bedrag", 500, 3000),
    btw: { inclusief: true, standaard: 9, kor: false },
    betaalTekst: "Je betaalt bij het afhalen in de schuur, of contant aan de bezorger.",
    uren: {
      kop: "Openingstijden van de schuur",
      regels: [
        { dag: "Maandag en dinsdag", tijd: "Gesloten" },
        { dag: "Woensdag t/m vrijdag", tijd: "09:00 – 17:30" },
        { dag: "Zaterdag", tijd: "09:00 – 16:00" },
        { dag: "Zondag", tijd: "Gesloten" },
      ],
    },
    contact: { kop: "Een vraag over een product of je bestelling?", tekst: "Stuur ons een bericht, we antwoorden binnen een werkdag. Vragen over allergieën zoeken we voor je uit bij de maker." },
  },
  {
    id: "wonen",
    code: "won",
    slug: winkelVoorbeeldSlug("wonen"),
    bedrijf: bedrijf("De Vensterbank"),
    omschrijving: "Woonwinkel met planten, potten en zachte stoffen: kleuren en geuren om uit te kiezen, een plant die uitverkocht is, een aanbieding en verzenden naar heel de EU.",
    hero: {
      kop: "Planten en mooie dingen voor in huis",
      tekst: "Groen voor elke vensterbank, potten van terracotta en stoffen die je huis warmer maken. Op wens mooi ingepakt, met een kaartje.",
      foto: { pexels: 3952027, alt: "Planten in kleipotten bij een zonnig raam" },
    },
    over: {
      kop: "Een winkel die begon op de vensterbank",
      tekst: "Wat begon met stekjes op onze eigen vensterbank, is nu een woonwinkel in Zonnedorp. We kiezen planten die makkelijk groeien en dingen die je jaren houdt.",
      lang: "We verkopen planten die ook bij minder groene vingers blijven leven, en vertellen bij elke plant hoeveel licht en water hij wil. Daarnaast potten, vazen, kaarsen en stoffen die er goed bij passen.\n\nPlanten verpakken we stevig, in een doos met vulmateriaal van papier. Zo komen ze heel aan, ook in de winter.",
      foto: { pexels: 9414267, alt: "Een vrouw bekijkt kleipotten in een tuinwinkel" },
    },
    assortiment: "Assortiment",
    nieuw: { kop: "Nieuw op de vensterbank", tekst: "Planten en woonaccessoires, met zorg verpakt." },
    usps: {
      kop: "Waarom bij De Vensterbank",
      items: [
        { titel: "Cadeau-verpakking", tekst: "Zet bij het bestellen bij de opmerking dat het een cadeau is, dan pakken we het in met een kaartje." },
        { titel: "Direct naar de ontvanger", tekst: "Stuur het rechtstreeks naar het adres van de ander." },
        { titel: "Planten die heel aankomen", tekst: "Stevig verpakt in een doos met papier, ook in de winter." },
      ],
    },
    uitgelicht: { sleutel: "monstera", kop: "Plant van de maand", tekst: "De monstera: groot blad, weinig zorg." },
    reviews: ["De monstera kwam stevig verpakt en zonder één geknakt blad aan. Hij staat nu te pronken bij het raam.", "Een kaars als cadeau laten sturen, met een kaartje erbij. Mijn zus was er heel blij mee."],
    producten: [
      {
        sleutel: "monstera",
        naam: "Monstera in terracotta pot",
        categorie: "Planten",
        prijsCents: 3495,
        korteTekst: "De plant met de grote, gespleten bladeren",
        omschrijving: "Een monstera van zo'n 60 cm hoog, in een pot van terracotta. Hij houdt van licht maar niet van felle zon, en wil water als de bovenste paar centimeter aarde droog is.\n\nIn de winter minder water geven.",
        foto: { pexels: 9412403, alt: "Een monstera in een terracotta pot in het daglicht" },
        voorraad: 5,
      },
      {
        sleutel: "vetplanten",
        naam: "Vetplanten, set van 4",
        categorie: "Planten",
        prijsCents: 1995,
        korteTekst: "Bijna geen water nodig",
        omschrijving: "Vier verschillende vetplantjes in kleine terracotta potjes. Zet ze op een zonnige plek en geef ze eens in de twee weken een klein beetje water.\n\nPotjes van 6 cm doorsnede.",
        foto: { pexels: 1556764, alt: "Vier vetplanten in terracotta potjes op een houten tafel" },
      },
      {
        sleutel: "sansevieria",
        naam: "Vrouwentong (sansevieria)",
        categorie: "Planten",
        prijsCents: 2495,
        korteTekst: "Sterk en makkelijk, ook in de schaduw",
        omschrijving: "De makkelijkste plant die er is: een vrouwentong kan tegen schaduw, droge lucht en een keer vergeten water geven.\n\nOngeveer 50 cm hoog, in een kweekpot van 17 cm.",
        foto: { pexels: 29218657, alt: "Een vrouwentong in een moderne pot in een lichte kamer" },
        uitverkocht: true,
      },
      {
        sleutel: "gieter",
        naam: "Gieter met lange tuit",
        categorie: "Planten",
        prijsCents: 2295,
        korteTekst: "Water precies waar het moet",
        omschrijving: "Een gieter van metaal met een lange, smalle tuit, zodat het water op de aarde komt en niet op de bladeren.\n\nInhoud 1 liter.",
        foto: { pexels: 11624605, alt: "Gieters tussen de planten op een zonnige vensterbank" },
      },
      {
        sleutel: "potten",
        naam: "Terracotta bloempotten, set van 3",
        categorie: "Decoratie",
        prijsCents: 1795,
        korteTekst: "Klassieke gebakken klei, in drie maten",
        omschrijving: "Drie potten van ongeglazuurde terracotta, van 12, 15 en 18 cm doorsnede, met een gat in de bodem. Terracotta laat de aarde ademen, zodat de wortels niet te nat staan.",
        foto: { pexels: 5780843, alt: "Gestapelde kleipotten van terracotta" },
      },
      {
        sleutel: "vaas",
        naam: "Keramische vaas",
        categorie: "Decoratie",
        prijsCents: 2995,
        korteTekst: "Met de hand gevormd, mooi met of zonder bloemen",
        omschrijving: "Een vaas van matte keramiek, met de hand gevormd, dus elke vaas is net even anders. Mooi met droogbloemen of een paar takken uit de tuin.\n\nHoogte 22 cm. Van binnen waterdicht.",
        foto: { pexels: 5040767, alt: "Keramische vazen met droogbloemen tegen een witte achtergrond" },
        opties: [kleuren("Zand", "Wit")],
      },
      {
        sleutel: "kaars",
        naam: "Geurkaars van sojawas",
        categorie: "Decoratie",
        prijsCents: 1895,
        korteTekst: "Brandt zo'n 40 uur, schoon en rustig",
        omschrijving: "Een kaars van sojawas in een glazen pot, met een katoenen lont. Brandt ongeveer 40 uur.\n\nBrand hem de eerste keer minstens twee uur, zodat de bovenkant helemaal smelt. Dan brandt hij daarna gelijkmatig.",
        foto: { pexels: 6634662, alt: "Handgemaakte kaarsen in glazen potten op een rond dienblad" },
        opties: [{ naam: "Geur", waarden: ["Vijg", "Cederhout", "Katoen"] }],
        voorraad: 6,
      },
      {
        sleutel: "mand",
        naam: "Gevlochten mand",
        categorie: "Decoratie",
        prijsCents: 2795,
        korteTekst: "Voor plaids, speelgoed of een grote plant",
        omschrijving: "Een stevige mand, met de hand gevlochten. Voor plaids en kussens, of als overpot voor een grote plant.\n\nDoorsnede 35 cm, hoogte 30 cm.",
        foto: { pexels: 9695849, alt: "Gevlochten manden van riet en rotan op een donkere ondergrond" },
      },
      {
        sleutel: "kussen",
        naam: "Kussenhoes van linnen",
        categorie: "Textiel",
        prijsCents: 2495,
        korteTekst: "Met een verborgen rits",
        omschrijving: "Een kussenhoes van gewassen linnen, 45 bij 45 cm, met een rits aan de onderkant. Zonder binnenkussen.\n\nWassen op 40 graden.",
        foto: { pexels: 8762877, alt: "Een stapel linnen kussens in verschillende kleuren" },
        opties: [kleuren("Ecru", "Terracotta", "Olijf")],
      },
      {
        sleutel: "plaid",
        naam: "Gebreide plaid",
        categorie: "Textiel",
        prijsCents: 5995,
        oudePrijsCents: 7495,
        korteTekst: "Grof gebreid en heerlijk zwaar",
        omschrijving: "Een grof gebreide plaid van katoen, 130 bij 170 cm. Zwaar genoeg om onder weg te kruipen, luchtig genoeg voor op de bank in de zomer.\n\nWassen op 30 graden, liggend drogen.",
        foto: { pexels: 3996529, alt: "Een rode gebreide plaid in het zonlicht" },
        opties: [kleuren("Rood", "Zand")],
      },
    ],
    verzendmethoden: [
      methode("vwafhalen", "afhalen", "Afhalen in de winkel", 0, null, "Dezelfde dag klaar"),
      methode("vwpakket", "bezorgen", "Pakket aan huis", 595, 5000, "2 tot 3 werkdagen"),
      methode("vweuropa", "bezorgen", "Pakket naar België, Duitsland en de rest van de EU", 1295, 12500, "3 tot 6 werkdagen", "eu"),
    ],
    verzendExtra: "Planten versturen we van maandag tot en met woensdag, zodat ze nooit een weekend in een doos zitten.",
    faq: [
      { vraag: "Komen planten heel aan?", antwoord: "Ja, we verpakken ze rechtop in een stevige doos met papier. Is er toch iets beschadigd, stuur ons dan binnen twee dagen een foto." },
      { vraag: "Kan ik iets als cadeau laten inpakken?", antwoord: "Ja, zet bij de opmerking dat het een cadeau is en wat er op het kaartje moet. We pakken het gratis in." },
      { vraag: "Mag ik een plant terugsturen?", antwoord: "Planten mag je binnen 14 dagen terugsturen als ze nog in goede staat zijn. Kaarsen alleen als ze nog niet gebrand hebben." },
    ],
    korting: korting("kwgroen", "GROEN10", "procent", 10, 4000),
    btw: BTW_HOOG,
    betaalTekst: "Je betaalt bij het afhalen in de winkel, of contant aan de bezorger.",
    uren: {
      kop: "Openingstijden van de winkel",
      regels: [
        { dag: "Maandag", tijd: "13:00 – 17:30" },
        { dag: "Dinsdag t/m zaterdag", tijd: "09:30 – 17:30" },
        { dag: "Zondag", tijd: "Gesloten" },
      ],
    },
    contact: { kop: "Een vraag over een plant of je bestelling?", tekst: "Stuur ons een bericht, we antwoorden binnen een werkdag. Een foto van je plant helpt als je advies wilt." },
  },
  {
    id: "beauty",
    code: "bea",
    slug: winkelVoorbeeldSlug("beauty"),
    bedrijf: bedrijf("Salie & Zeep"),
    omschrijving: "Winkel in natuurlijke verzorging: geuren en haartypes om uit te kiezen, de ingrediënten bij het product, een brievenbuspakje, een aanbieding en een cadeauset die uitverkocht is.",
    hero: {
      kop: "Natuurlijke verzorging, met de hand gemaakt",
      tekst: "Zeep, olie en crème van eerlijke ingrediënten, in kleine series gemaakt in Zonnedorp. Bij elk product staat precies wat erin zit.",
      foto: { pexels: 6690234, alt: "Potjes crème tussen groene blaadjes en bloemblaadjes, van bovenaf" },
    },
    over: {
      kop: "Kleine series, eerlijke ingrediënten",
      tekst: "Salie & Zeep maakt verzorging in een kleine werkplaats in Zonnedorp. Zonder onnodige toevoegingen, en met de ingrediënten gewoon op het etiket.",
      lang: "Onze zeep maken we op de koude manier: hij rijpt zes weken voordat hij de winkel in gaat. Zo blijven de oliën zacht voor je huid.\n\nWe verpakken alles in papier en glas, en gebruiken zo weinig plastic als we kunnen. Twijfel je wat bij je huid of haar past? Stuur ons een bericht, dan geven we eerlijk advies.",
      foto: { pexels: 7500223, alt: "Handen houden een stapel handgemaakte zeepblokken vast" },
    },
    assortiment: "Assortiment",
    nieuw: { kop: "Vers uit de werkplaats", tekst: "In kleine series gemaakt, dus op is op." },
    usps: {
      kop: "Waarom bij Salie & Zeep",
      items: [
        { titel: "Duidelijke ingrediënten", tekst: "Alles wat erin zit, staat bij het product." },
        { titel: "Persoonlijk advies", tekst: "Twijfel je? Stuur ons een bericht." },
        { titel: "Door de brievenbus", tekst: "Zeep en balsem passen in een brievenbuspakje: je hoeft niet thuis te blijven." },
      ],
    },
    uitgelicht: { sleutel: "zeep", kop: "Onze bestseller", tekst: "Handgemaakte zeep, zes weken gerijpt, in vier geuren." },
    reviews: ["De zeep met rozemarijn ruikt heerlijk en mijn handen zijn minder droog. Kwam gewoon door de brievenbus.", "Eerlijk advies gekregen over een shampoobar voor mijn droge haar. Precies wat ik zocht."],
    producten: [
      {
        sleutel: "zeep",
        naam: "Handgemaakte zeep",
        categorie: "Bad en lichaam",
        prijsCents: 695,
        korteTekst: "Koud geroerd, zacht voor je huid",
        omschrijving: "Een blok zeep van olijfolie, kokosolie en sheaboter, koud geroerd en zes weken gerijpt. Schuimt romig en droogt je huid niet uit.\n\nOngeveer 100 gram. Ingrediënten: olijfolie, kokosolie, sheaboter, water, natriumhydroxide (verdwijnt bij het rijpen) en etherische olie bij de geur van je keuze.",
        foto: { pexels: 6621470, alt: "Een rij handgemaakte zeepblokken op een lichte marmeren ondergrond" },
        opties: [{ naam: "Geur", waarden: ["Lavendel", "Citroen", "Rozemarijn", "Zonder geur"] }],
      },
      {
        sleutel: "shampoobar",
        naam: "Shampoobar",
        categorie: "Haar",
        prijsCents: 995,
        korteTekst: "Gaat zo lang mee als twee flessen shampoo",
        omschrijving: "Een vaste shampoo zonder plastic verpakking. Maak je haar nat, wrijf de bar een paar keer over je hoofd en masseer het schuim uit. Laat hem na gebruik goed drogen, dan gaat hij het langst mee.\n\nOngeveer 60 gram.",
        foto: { pexels: 6690839, alt: "Blokken natuurlijke zeep en shampoo naast elkaar op een lichte achtergrond" },
        opties: [{ naam: "Haartype", waarden: ["Normaal haar", "Droog haar", "Snel vet haar"] }],
      },
      {
        sleutel: "borstel",
        naam: "Haarborstel van hout",
        categorie: "Haar",
        prijsCents: 1295,
        korteTekst: "Houten pinnen, zacht voor je hoofdhuid",
        omschrijving: "Een borstel van beukenhout met houten pinnen en een kussen van natuurrubber. Ontwart zacht, ook nat haar.",
        foto: { pexels: 9859322, alt: "Een houten haarborstel naast een gevlochten mandje" },
      },
      {
        sleutel: "olie",
        naam: "Gezichtsolie met rozenbottel, 30 ml",
        categorie: "Huid",
        prijsCents: 2495,
        korteTekst: "Een paar druppels voor de nacht",
        omschrijving: "Een lichte olie van rozenbottelpitolie en jojoba die snel intrekt. Verwarm drie druppels tussen je handen en druk ze zacht op je gezicht.\n\nIngrediënten: rozenbottelpitolie, jojobaolie, vitamine E.",
        foto: { pexels: 8054327, alt: "Een bruin flesje met pipet naast een stuk lavasteen" },
      },
      {
        sleutel: "creme",
        naam: "Dagcrème, 50 ml",
        categorie: "Huid",
        prijsCents: 2195,
        korteTekst: "Licht en zonder toegevoegde geur",
        omschrijving: "Een lichte crème die snel intrekt en je huid zacht laat aanvoelen, zonder toegevoegde geur. Voor elke dag, ook onder make-up.\n\nIngrediënten: water, sheaboter, amandelolie, plantaardige glycerine, emulgator uit olijven, conserveermiddel.",
        foto: { pexels: 6690232, alt: "Potjes crème met groene blaadjes op marmer" },
        voorraad: 5,
      },
      {
        sleutel: "lippenbalsem",
        naam: "Lippenbalsem in blikje",
        categorie: "Huid",
        prijsCents: 495,
        korteTekst: "Van bijenwas en sheaboter",
        omschrijving: "Een balsem van bijenwas, sheaboter en zonnebloemolie, in een handig blikje voor in je jaszak.\n\n15 gram.",
        foto: { pexels: 6187571, alt: "Lippenbalsem in gestapelde metalen blikjes op een kleurige achtergrond" },
        opties: [{ naam: "Smaak", waarden: ["Naturel", "Vanille", "Munt"] }],
      },
      {
        sleutel: "lotion",
        naam: "Bodylotion, 250 ml",
        categorie: "Bad en lichaam",
        prijsCents: 1495,
        oudePrijsCents: 1795,
        korteTekst: "Trekt snel in en plakt niet",
        omschrijving: "Een romige lotion met sheaboter en aloë vera die snel intrekt, met een lichte geur van salie en citroen.\n\nIn een fles van gerecycled plastic met een pompje.",
        foto: { pexels: 8054404, alt: "Een witte fles bodylotion met pompje in het zonlicht" },
      },
      {
        sleutel: "badzout",
        naam: "Badzout met lavendel, 400 gram",
        categorie: "Bad en lichaam",
        prijsCents: 1195,
        korteTekst: "Zeezout met gedroogde lavendel",
        omschrijving: "Grof zeezout met gedroogde lavendelbloemen, in een glazen pot met een houten lepeltje. Twee volle lepels in een warm bad zijn genoeg.",
        foto: { pexels: 32152698, alt: "Badzout met lavendel in een pot met een houten lepel" },
      },
      {
        sleutel: "scrub",
        naam: "Suikerscrub, 200 ml",
        categorie: "Bad en lichaam",
        prijsCents: 1395,
        korteTekst: "Voor een zachte huid, zonder plastic korreltjes",
        omschrijving: "Een scrub van fijne suiker en kokosolie, met een vleugje vanille. Masseer hem onder de douche over je natte huid en spoel af.\n\nIngrediënten: suiker, kokosolie, amandelolie, vanille-extract.",
        foto: { pexels: 7795653, alt: "Een glazen pot met scrub naast een natuurlijke spons" },
      },
      {
        sleutel: "cadeauset",
        naam: "Cadeauset Tijd voor jezelf",
        categorie: "Cadeaus",
        prijsCents: 3995,
        korteTekst: "Een kopje, een slaapmasker en een haarelastiekje",
        omschrijving: "Een cadeaudoos met een handgemaakt keramisch kopje, een zacht slaapmasker en een haarelastiekje, mooi verpakt. Voor wie wel een avondje rust kan gebruiken.",
        foto: { pexels: 17555293, alt: "Een cadeaudoos met een keramisch kopje, een slaapmasker en een haarelastiekje" },
        uitverkocht: true,
      },
    ],
    verzendmethoden: [
      methode("vwafhalen", "afhalen", "Afhalen in de werkplaats", 0, null, "De volgende werkdag klaar"),
      methode("vwbrief", "bezorgen", "Brievenbuspakje", 395, 3500, "1 tot 2 werkdagen"),
      methode("vwpakket", "bezorgen", "Pakket aan huis", 595, 5000, "1 tot 2 werkdagen"),
    ],
    verzendExtra: "Past je bestelling door de brievenbus (zeep, balsem, een shampoobar), kies dan het brievenbuspakje. Flessen en potten sturen we als pakket. Voor 14.00 uur besteld, dezelfde werkdag verzonden.",
    faq: [
      { vraag: "Is jullie zeep geschikt voor een gevoelige huid?", antwoord: "Kies dan de zeep zonder geur. Bij elk product staan alle ingrediënten, zodat je kunt zien of er iets in zit waar je niet tegen kunt." },
      { vraag: "Hoe lang gaat een shampoobar mee?", antwoord: "Ongeveer zo lang als twee flessen shampoo, als je hem na het wassen goed laat drogen." },
      { vraag: "Mag ik verzorging terugsturen?", antwoord: "Ja, binnen 14 dagen, als het product nog dicht en ongebruikt is. Om hygiënische redenen nemen we geopende producten niet terug." },
    ],
    korting: korting("kwzacht", "ZACHT10", "procent", 10, 2500),
    btw: BTW_HOOG,
    betaalTekst: "Je betaalt bij het afhalen in de werkplaats, of contant aan de bezorger.",
    uren: {
      kop: "Klantenservice en werkplaats",
      regels: [
        { dag: "Maandag t/m vrijdag", tijd: "09:00 – 16:00" },
        { dag: "Zaterdag", tijd: "10:00 – 14:00" },
        { dag: "Zondag", tijd: "Gesloten" },
      ],
    },
    contact: { kop: "Advies nodig of een vraag over je bestelling?", tekst: "Stuur ons een bericht, we antwoorden binnen een werkdag. Vertel iets over je huid of haar, dan geven we eerlijk advies." },
  },
  {
    id: "vakwinkel",
    code: "vak",
    slug: winkelVoorbeeldSlug("vakwinkel"),
    bedrijf: bedrijf("Vakhandel Zonnedorp"),
    omschrijving: "Vakwinkel voor gereedschap, veiligheid en bevestiging: prijzen exclusief btw voor zakelijke klanten, maten om uit te kiezen, afhalen aan de balie en bezorgen op de bouwplaats.",
    hero: {
      kop: "Gereedschap en veiligheid voor de vakman",
      tekst: "Handgereedschap, veiligheid en bevestigingsmateriaal, op voorraad in Zonnedorp. Alle prijzen zijn exclusief btw: die komt er bij het afrekenen bij.",
      foto: { pexels: 30361320, alt: "Een wand vol gereedschap in een werkplaats" },
    },
    over: {
      kop: "De vaste stop voor de bouw",
      tekst: "Vakhandel Zonnedorp levert aan aannemers, installateurs en klussers. Wat op de site staat, ligt bij ons in het magazijn.",
      lang: "Onze balie gaat vroeg open, zodat je op weg naar de klus nog even langs kunt. Bestel je online voor 16.00 uur, dan ligt het de volgende ochtend voor je klaar, of brengen we het met onze eigen bus naar de bouwplaats.\n\nAdvies nodig over een schroef, een plug of de maat van werkschoenen? Vraag het aan de balie of stuur ons een bericht.",
      foto: { pexels: 19756443, alt: "Een winkelier ordent gereedschap in een ijzerwarenwinkel" },
    },
    assortiment: "Assortiment",
    nieuw: { kop: "Veel besteld", tekst: "Voor 16.00 uur besteld, de volgende ochtend klaar aan de balie." },
    usps: {
      kop: "Waarom bij Vakhandel Zonnedorp",
      items: [
        { titel: "Op voorraad", tekst: "Wat je op de site ziet, ligt bij ons in het magazijn." },
        { titel: "Vroeg open", tekst: "De balie gaat om zeven uur open, op weg naar de klus." },
        { titel: "Op de bouwplaats bezorgd", tekst: "Met onze eigen bus, de volgende werkdag, in de regio Zonnedorp." },
      ],
    },
    uitgelicht: { sleutel: "koffer", kop: "Deze maand in de aanbieding", tekst: "Een stevige gereedschapskoffer met uitneembare bak, nu € 10 goedkoper." },
    reviews: ["Om tien over zeven mijn bestelling aan de balie opgehaald en om half acht op de klus. Zo moet het.", "De bus bracht de schroeven en de werkschoenen gewoon naar de bouwplaats. Scheelt mij een rit."],
    producten: [
      {
        sleutel: "hamer",
        naam: "Klauwhamer, 450 gram",
        categorie: "Gereedschap",
        prijsCents: 1895,
        korteTekst: "Stalen kop en een handvat dat niet wegglijdt",
        omschrijving: "Een klauwhamer met een gesmede stalen kop en een handvat met rubber dat niet uit je hand glijdt. Met de klauw trek je spijkers er zo weer uit.",
        foto: { pexels: 5845891, alt: "Hamers naast elkaar op een plank in een werkplaats" },
      },
      {
        sleutel: "schroevendraaier",
        naam: "Schroevendraaierset, 3-delig",
        categorie: "Gereedschap",
        prijsCents: 1495,
        korteTekst: "Twee platte en een kruiskop",
        omschrijving: "Drie schroevendraaiers met een blad van gehard staal en een handvat met zachte grip: twee platte en één kruiskop.",
        foto: { pexels: 5583097, alt: "Drie schroevendraaiers op een houten ondergrond" },
      },
      {
        sleutel: "waterpas",
        naam: "Waterpas, 60 cm",
        categorie: "Gereedschap",
        prijsCents: 2150,
        korteTekst: "Aluminium, met drie libellen",
        omschrijving: "Een stevige waterpas van aluminium met een libel voor horizontaal, een voor verticaal en een voor 45 graden. Met een magneetstrip, zodat hij aan stalen profielen blijft hangen.",
        foto: { pexels: 6251067, alt: "Een waterpas tegen een gele achtergrond" },
        uitverkocht: true,
      },
      {
        sleutel: "rolmaat",
        naam: "Rolmaat, 5 meter",
        categorie: "Gereedschap",
        prijsCents: 895,
        korteTekst: "Met stopknop en riemclip",
        omschrijving: "Een rolmaat van 5 meter met een band van 25 mm breed die ver uitsteekt zonder te knikken. Met een stopknop en een clip voor aan je riem.",
        foto: { pexels: 30413398, alt: "Een rolmaat op een bouwplaats" },
        voorraad: 20,
      },
      {
        sleutel: "koffer",
        naam: "Gereedschapskoffer met inzetbak",
        categorie: "Gereedschap",
        prijsCents: 4995,
        oudePrijsCents: 5995,
        korteTekst: "Slagvast, met een uitneembare bak",
        omschrijving: "Een gereedschapskoffer van slagvast kunststof met een uitneembare inzetbak en vakjes in het deksel voor schroeven en bits. Wordt leeg geleverd.\n\n48 bij 25 bij 23 cm.",
        foto: { pexels: 11882650, alt: "Een grijze gereedschapskist met schroevendraaiers erin" },
      },
      {
        sleutel: "handschoenen",
        naam: "Werkhandschoenen, 12 paar",
        categorie: "Veiligheid",
        prijsCents: 2995,
        korteTekst: "Grip op nat en droog",
        omschrijving: "Werkhandschoenen met een gecoate handpalm voor grip, ook als het nat is. De rug ademt, dus je handen blijven droog.\n\nPer doos van 12 paar.",
        foto: { pexels: 8488007, alt: "Werkhandschoenen in felle kleuren van dichtbij" },
        opties: [maten("8 (M)", "9 (L)", "10 (XL)", "11 (XXL)")],
      },
      {
        sleutel: "schoenen",
        naam: "Hoge werkschoenen met stalen neus",
        categorie: "Veiligheid",
        prijsCents: 8995,
        korteTekst: "Stalen neus en een zool die niet wegglijdt",
        omschrijving: "Hoge werkschoenen met een stalen neus, een tussenzool waar je niet doorheen trapt en een loopzool die niet wegglijdt. Van waterafstotend leer.\n\nVallen normaal: kies je gewone schoenmaat.",
        foto: { pexels: 30229920, alt: "Stevige werkschoenen op een ruwe ondergrond" },
        opties: [maten("39", "40", "41", "42", "43", "44", "45", "46", "47")],
        voorraad: 8,
      },
      {
        sleutel: "bril",
        naam: "Veiligheidsbril",
        categorie: "Veiligheid",
        prijsCents: 695,
        korteTekst: "Licht, met glazen die niet snel krassen",
        omschrijving: "Een lichte veiligheidsbril met glazen die niet snel krassen of beslaan. Zit prettig, ook de hele dag.",
        foto: { pexels: 7789650, alt: "Veiligheidsbrillen in verschillende kleuren naast elkaar" },
        opties: [{ naam: "Glas", waarden: ["Helder", "Getint"] }],
      },
      {
        sleutel: "hesje",
        naam: "Veiligheidshesje, oranje",
        categorie: "Veiligheid",
        prijsCents: 595,
        korteTekst: "Fel oranje, met reflecterende strepen",
        omschrijving: "Een fel oranje hesje met twee reflecterende strepen rondom, zodat je goed gezien wordt langs de weg en op de bouwplaats. Sluit met klittenband.",
        foto: { pexels: 34442873, alt: "Oranje veiligheidshesjes en blauwe helmen aan een rek" },
        opties: [maten("M/L", "XL/XXL")],
      },
      {
        sleutel: "schroeven",
        naam: "Houtschroeven, assortimentsdoos",
        categorie: "Bevestiging",
        prijsCents: 1995,
        korteTekst: "600 schroeven in 6 maten",
        omschrijving: "Een doos met 600 verzinkte houtschroeven met kruiskop, van 3,5 x 20 tot 5 x 50 mm, elke maat in een eigen vak.",
        foto: { pexels: 9131071, alt: "Een sorteerdoos met verschillende soorten schroeven" },
      },
      {
        sleutel: "pluggen",
        naam: "Pluggen en schroeven, 300 stuks",
        categorie: "Bevestiging",
        prijsCents: 1295,
        korteTekst: "Voor beton, steen en gipsplaat",
        omschrijving: "Een assortiment universele pluggen met passende schroeven, van 5 tot 10 mm. Voor beton, baksteen en gipsplaat.",
        foto: { pexels: 5691652, alt: "Schroeven, bouten en pluggen in een doos op tafel" },
      },
    ],
    verzendmethoden: [
      methode("vwafhalen", "afhalen", "Afhalen aan de balie", 0, null, "Voor 16.00 uur besteld, morgen om 07.00 uur klaar"),
      methode("vwpakket", "bezorgen", "Pakket aan huis", 695, 15000, "1 tot 2 werkdagen"),
      methode("vwbus", "bezorgen", "Bezorgen op de bouwplaats (eigen bus, regio Zonnedorp)", 1500, 50000, "De volgende werkdag"),
    ],
    verzendExtra: "Pakketten die we voor 16.00 uur op een werkdag ontvangen, gaan dezelfde dag de deur uit. De bus rijdt elke werkdag in de ochtend.",
    faq: [
      { vraag: "Zijn de prijzen inclusief btw?", antwoord: "Nee, alle prijzen op deze site zijn exclusief btw. De btw van 21% komt er bij het afrekenen bij en staat apart in het overzicht." },
      { vraag: "Kunnen jullie op de bouwplaats bezorgen?", antwoord: "Ja, in de regio Zonnedorp met onze eigen bus. Zet het adres van de bouwplaats bij het bezorgadres en een telefoonnummer van iemand die er is." },
      { vraag: "Is iets niet op voorraad?", antwoord: "Dan zie je dat bij het product. Laat je e-mailadres achter, dan krijg je een bericht zodra het er weer is." },
    ],
    korting: korting("kwbouw", "BOUW25", "bedrag", 2500, 25000),
    btw: { inclusief: false, standaard: 21, kor: false },
    betaalTekst: "Je betaalt bij het afhalen aan de balie, of aan de chauffeur als we bezorgen.",
    uren: {
      kop: "Openingstijden van de balie",
      regels: [
        { dag: "Maandag t/m vrijdag", tijd: "07:00 – 17:00" },
        { dag: "Zaterdag", tijd: "08:00 – 12:00" },
        { dag: "Zondag", tijd: "Gesloten" },
      ],
    },
    contact: { kop: "Een vraag over een product of je bestelling?", tekst: "Stuur ons een bericht, we antwoorden dezelfde werkdag. Zet erbij voor welke klus het is, dan denken we mee." },
  },
];

export const winkelVoorbeeldVoorSlug = (slug: string): WinkelVoorbeeld | null => WINKEL_VOORBEELDEN.find((v) => v.slug === slug) ?? null;
export const winkelVoorbeeldVoorOntwerp = (ontwerp: string): WinkelVoorbeeld | null => WINKEL_VOORBEELDEN.find((v) => v.id === ontwerp) ?? null;

export const winkelVoorbeeldProductId = (v: Pick<WinkelVoorbeeld, "code">, p: Pick<VoorbeeldProduct, "sleutel">) => `pw${v.code}${p.sleutel}`;

/** Alle foto's van een voorbeeldwebshop: de opening ("hero"), over ons ("over") en elk product (op zijn sleutel). */
export function winkelVoorbeeldFotos(v: WinkelVoorbeeld): Record<string, WinkelFoto> {
  return { hero: v.hero.foto, over: v.over.foto, ...Object.fromEntries(v.producten.map((p) => [p.sleutel, p.foto])) };
}

/** De stijl van het ontwerp, zoals een nieuwe webshop hem krijgt (lib/sites/store.ts createSite): premium in de kleuren van het ontwerp. */
export function winkelVoorbeeldThema(v: Pick<WinkelVoorbeeld, "id">): Theme {
  const t = webshopTemplate(v.id);
  return { kleur: t.theme.kleur, accent: t.theme.accent, lettertype: "modern", hoeken: "rond", stijl: "premium" };
}

/** De winkel zelf: producten met hun foto's en de instellingen voor bestellen; `foto` geeft het media-id, of null als de foto niet op te halen was. */
export function winkelVoorbeeldWinkel(v: WinkelVoorbeeld, foto: (key: string) => string | null): Winkel {
  const producten = v.producten.map((p): SiteProduct => {
    const f = foto(p.sleutel);
    return {
      id: winkelVoorbeeldProductId(v, p),
      naam: p.naam,
      slug: slugify(p.naam),
      prijsCents: p.prijsCents,
      oudePrijsCents: p.oudePrijsCents ?? null,
      korteTekst: p.korteTekst,
      omschrijving: p.omschrijving,
      fotos: f ? [f] : [],
      categorie: p.categorie,
      zichtbaar: true,
      uitverkocht: p.uitverkocht ?? false,
      ...(p.voorraad !== undefined ? { voorraad: p.voorraad } : {}),
      ...(p.opties ? { opties: p.opties } : {}),
      ...(p.btw !== undefined ? { btw: p.btw } : {}),
    };
  });
  return {
    producten,
    bestellen: true,
    levering: leveringVan(v.verzendmethoden),
    betaalTekst: v.betaalTekst,
    verzendmethoden: v.verzendmethoden,
    kortingscodes: [v.korting],
    betalen: BETALEN,
    btw: v.btw,
  };
}

/** De tekst van "Verzenden en retourneren": de verzendmethoden van de winkel zelf, dus altijd met de juiste bedragen. */
export function winkelVoorbeeldVerzendTekst(v: Pick<WinkelVoorbeeld, "verzendmethoden" | "verzendExtra" | "btw">): string {
  const klein = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;
  const regels = v.verzendmethoden.filter((m) => m.actief).map((m) => `${m.naam}: ${klein(prijsTekst(m))}${m.levertijd ? ` (${klein(m.levertijd)})` : ""}`);
  return [`Zo kun je je bestelling krijgen:\n${regels.join("\n")}`, v.verzendExtra, v.btw.inclusief ? "" : "Alle bedragen zijn exclusief btw."].filter(Boolean).join("\n\n");
}

const RETOUR =
  "Je mag je bestelling binnen 14 dagen na ontvangst zonder opgave van reden terugsturen. Laat het ons vooraf weten via het contactformulier. Het product moet ongebruikt en compleet zijn. Het aankoopbedrag betalen we binnen 14 dagen na ontvangst van de retourzending terug. De kosten van het terugsturen zijn voor jou.\n\nIs er iets beschadigd of verkeerd geleverd? Stuur ons binnen een paar dagen een foto, dan lossen we het op.";

/** De algemene voorwaarden van een nieuwe webshop, met de btw zoals deze winkel rekent. */
export function winkelVoorbeeldVoorwaarden(v: Pick<WinkelVoorbeeld, "bedrijf" | "btw">): string {
  const tekst = voorwaardenTekst(v.bedrijf);
  return v.btw.inclusief ? tekst : tekst.replace("zijn inclusief btw", "zijn exclusief btw; de btw komt er bij het afrekenen bij");
}

/** De pagina's van een voorbeeldwebshop; `foto` geeft het media-id van een foto, of null als hij niet op te halen was. */
export function winkelVoorbeeldPaginas(v: WinkelVoorbeeld, foto: (key: string) => string | null): Page[] {
  let n = 0;
  const block = <T extends BlockType>(type: T, props: BlockProps[T]) => ({ id: `bw${v.code}${String(++n).padStart(3, "0")}`, type, props }) as Block;
  const t = webshopTemplate(v.id);
  const naam = v.bedrijf.naam;
  const k = v.korting;
  const categorieen = [...new Set(v.producten.map((p) => p.categorie))];
  const uitgelicht = v.producten.find((p) => p.sleutel === v.uitgelicht.sleutel);
  const usps = () => block("usps", v.usps);
  const reviews = () => block("reviews", { kop: "Zo kan het eruitzien met reviews (voorbeeld)", items: v.reviews.map((tekst) => ({ naam: "Voorbeeldklant", tekst, sterren: 5 })) });
  const cta = () => block("cta", { kop: "Klaar om te bestellen?", tekst: `Met de code ${k.code} krijg je ${kortingTekst(k)}. Vul hem in bij het bestellen.`, knop: t.knop, knopLink: "winkel" });
  const uren = () => block("openingstijden", v.uren);
  const seo = (s: string) => s.slice(0, 70);
  return [
    {
      id: `pw-${v.id}-home`,
      slug: "",
      titel: "Home",
      seoTitel: seo(`${naam} | ${t.naam}`),
      seoOmschrijving: v.hero.tekst.slice(0, 160),
      blocks: [
        block("hero", { kop: v.hero.kop, tekst: v.hero.tekst, knop: t.knop, knopLink: "winkel", foto: foto("hero") }),
        block("producten", { kop: v.nieuw.kop, tekst: v.nieuw.tekst, categorie: "", aantal: 8 }),
        usps(),
        ...(uitgelicht ? [block("uitgelicht", { productId: winkelVoorbeeldProductId(v, uitgelicht), kop: v.uitgelicht.kop, tekst: v.uitgelicht.tekst, fotoLinks: true })] : []),
        block("tekstFoto", { kop: v.over.kop, tekst: v.over.tekst, foto: foto("over"), fotoLinks: false }),
        reviews(),
        cta(),
      ],
    },
    {
      id: `pw-${v.id}-assortiment`,
      slug: "assortiment",
      titel: v.assortiment,
      seoTitel: seo(`${v.assortiment} | ${naam}`),
      seoOmschrijving: `${categorieen.join(", ")}: het hele ${v.assortiment.toLowerCase()} van ${naam}.`.slice(0, 160),
      blocks: [
        ...categorieen.map((c) => block("producten", { kop: c, tekst: "", categorie: c, aantal: 48 })),
        block("knoppen", { kop: "Iets specifieks zoeken?", items: [{ tekst: "Zoeken en filteren", link: "winkel", vorm: "vol" }] }),
      ],
    },
    {
      id: `pw-${v.id}-over`,
      slug: "over-ons",
      titel: "Over ons",
      seoTitel: seo(`Over ${naam}`),
      seoOmschrijving: v.over.tekst.slice(0, 160),
      blocks: [block("tekstFoto", { kop: `Over ${naam}`, tekst: v.over.lang, foto: foto("over"), fotoLinks: true }), usps(), reviews(), cta()],
    },
    {
      id: `pw-${v.id}-verzenden`,
      slug: "verzenden-en-retourneren",
      titel: "Verzenden en retourneren",
      menuLabel: "Verzenden",
      seoTitel: seo(`Verzenden en retourneren | ${naam}`),
      seoOmschrijving: `Hoe en wanneer ${naam} je bestelling verzendt, wat het kost en hoe retourneren werkt.`.slice(0, 160),
      blocks: [block("tekst", { kop: "Verzenden", tekst: winkelVoorbeeldVerzendTekst(v) }), block("tekst", { kop: "Retourneren", tekst: RETOUR }), block("faq", { kop: "Veelgestelde vragen", items: v.faq })],
    },
    {
      id: `pw-${v.id}-voorwaarden`,
      slug: "voorwaarden",
      titel: "Algemene voorwaarden",
      menuLabel: "Voorwaarden",
      seoTitel: seo(`Algemene voorwaarden | ${naam}`),
      seoOmschrijving: `De voorwaarden voor bestellingen bij ${naam}.`.slice(0, 160),
      blocks: [block("tekst", { kop: "Algemene voorwaarden", tekst: winkelVoorbeeldVoorwaarden(v) })],
    },
    {
      id: `pw-${v.id}-contact`,
      slug: "contact",
      titel: "Contact",
      seoTitel: seo(`Contact | ${naam}`),
      seoOmschrijving: v.contact.tekst.slice(0, 160),
      blocks: [block("contact", { kop: v.contact.kop, tekst: v.contact.tekst, formulier: true }), uren(), block("faq", { kop: "Veelgestelde vragen", items: v.faq })],
    },
  ];
}
