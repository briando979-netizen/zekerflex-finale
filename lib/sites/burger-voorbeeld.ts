import { STANDAARD_LAGEN } from "@/lib/sites/burger3d";
import { newBlock, slugify, type Block, type BlockProps, type BlockType, type Company, type Page, type SiteProduct, type Theme, type Winkel } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Voorbeeldsite van een hamburgerzaak (4 nov 2026, opdracht van de eigenaar):
// "Burgerbar Vuur" laat alles zien wat een restaurantsite kan: de 3D-burger die
// bij het scrollen in elkaar valt (lib/sites/burger3d.ts), het menu als webshop
// met winkelmand, zoeken en filters om af te halen of te laten bezorgen, en
// online een tafel reserveren. Het bedrijf bestaat niet (de balk zegt het), er
// staat geen telefoon of e-mail op, en de reviews heten "voorbeeld". Foto's:
// Pexels (vrije licentie, geen vermelding vereist), één keer opgehaald en bij
// ons bewaard (lib/sites/burger-demo.ts). Puur: alleen gegevens en pagina's.
// ---------------------------------------------------------------------------

export const BURGER_SLUG = "burgerbar-vuur";

export const BURGER_BEDRIJF: Company = { naam: "Burgerbar Vuur", kvk: "", straat: "", postcode: "", plaats: "Zonnedorp", telefoon: "", email: "" };
export const BURGER_THEMA: Theme = { kleur: "#2B1A12", accent: "#FF7A1A", lettertype: "modern", hoeken: "rond", stijl: "beleving" };

/** De foto's (nummers op Pexels) met hun beschrijving. */
export const BURGER_FOTOS = {
  vlam: { pexels: 33920157, alt: "Een dubbele cheeseburger met sla en tomaat boven open vuur" },
  chef: { pexels: 5779781, alt: "Een kok grilt vlees boven hoge vlammen in een open keuken" },
  grill: { pexels: 20042199, alt: "Burgers sissen op een gloeiende grill" },
  classic: { pexels: 22119674, alt: "Een cheeseburger met sesambol en friet" },
  smash: { pexels: 18713428, alt: "Een dubbele smashburger met gesmolten kaas, friet en een glas cola" },
  bbq: { pexels: 27998840, alt: "Een burger met spek en barbecuesaus op een bord met friet" },
  truffel: { pexels: 27098510, alt: "Een burger met rucola op een bord in een sfeervol restaurant" },
  spicy: { pexels: 23744957, alt: "Een hand houdt een glanzende burger met sla vast" },
  veggie: { pexels: 16637682, alt: "Een burger op een plank met friet" },
  kids: { pexels: 70497, alt: "Een burger met friet en een bakje saus" },
  friet: { pexels: 29150162, alt: "Knapperige friet met ketchup in een schaal" },
  loaded: { pexels: 11485199, alt: "Friet met saus en kruiden in een metalen mandje" },
  ringen: { pexels: 6941051, alt: "Een stapel uienringen met een rode peper en een fles saus" },
  snackbox: { pexels: 6941009, alt: "Friet, uienringen en kipnuggets met een rode peper" },
  aardbei: { pexels: 10066814, alt: "Een aardbeienmilkshake met slagroom in een hoog glas" },
  vanille: { pexels: 5946722, alt: "Een tweekleurige milkshake in een glas" },
  duo: { pexels: 8743860, alt: "Twee milkshakes, aardbei en banaan, met verse aardbeien" },
  mandjes: { pexels: 11374684, alt: "Burgers met friet in kleurige mandjes" },
  plank: { pexels: 5488051, alt: "Een rij burgers op een plank, klaar om op te dienen" },
  dubbel: { pexels: 15010311, alt: "Een dubbele cheeseburger op een leisteen" },
  toren: { pexels: 15662161, alt: "Een burger met een toren van uienringen" },
  bord: { pexels: 3219483, alt: "Een burger met friet op een houten plank" },
  tafel: { pexels: 2340204, alt: "Burgers, uienringen en milkshakes op een tafel" },
  vrienden: { pexels: 31650381, alt: "Vrienden eten burgers en worden geholpen door een vriendelijke serveerster" },
} as const;
export type BurgerFoto = keyof typeof BURGER_FOTOS;

export const burgerFotoUrl = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=2000`;

const UREN = [
  { dag: "Maandag", tijd: "Gesloten" },
  { dag: "Dinsdag t/m donderdag", tijd: "16:00 – 22:00" },
  { dag: "Vrijdag en zaterdag", tijd: "12:00 – 23:00" },
  { dag: "Zondag", tijd: "12:00 – 21:00" },
];

const FAQ = [
  { vraag: "Kan ik ook afhalen?", antwoord: "Ja. Bestel online en kies afhalen; je burger ligt klaar op de tijd die je opgeeft bij je opmerking." },
  { vraag: "Bezorgen jullie?", antwoord: "In Zonnedorp en omgeving. Bezorgen kost € 2,95, en is gratis vanaf € 25." },
  { vraag: "Hebben jullie vegetarische burgers?", antwoord: "Zeker: de Veggie Vuur, met een burger van zwarte bonen en geroosterde paprika. Elke burger kan ook op een glutenvrij broodje." },
  { vraag: "Kan ik met een groep komen?", antwoord: "Tot twaalf personen reserveer je online. Met meer? Neem contact op, dan zetten we de lange tafel voor jullie klaar." },
];

/** De pagina's; `foto` geeft het media-id van een foto, of null als hij niet op te halen was. */
export function burgerPaginas(foto: (k: BurgerFoto) => string | null): Page[] {
  let n = 0;
  const block = <T extends BlockType>(type: T, props: Partial<BlockProps[T]>) => {
    const b = newBlock(type, `bvuur${String(++n).padStart(3, "0")}`);
    return { ...b, props: { ...b.props, ...props } } as Block;
  };
  const galerij = (["mandjes", "plank", "dubbel", "toren", "bord", "tafel"] as const).map(foto).filter((f): f is string => Boolean(f));
  const reserveren = () =>
    block("reserveren", {
      kop: "Reserveer een tafel",
      tekst: "Kies een dag en met hoeveel je komt: je ziet meteen welke tijden nog vrij zijn, en je krijgt direct een bevestiging.",
      tijden: { "0": { van: "12:00", tot: "21:00" }, "1": null, "2": { van: "16:00", tot: "22:00" }, "3": { van: "16:00", tot: "22:00" }, "4": { van: "16:00", tot: "22:00" }, "5": { van: "12:00", tot: "23:00" }, "6": { van: "12:00", tot: "23:00" } },
      verblijfMinuten: 90,
      maxGroep: 12,
      maxGasten: 50,
    });
  const burger = () =>
    block("burger3d", {
      kop: "Laag voor laag de lekkerste burger.",
      tekst: "Scroll rustig verder en zie hoe de Vuur Classic in elkaar valt. Alles vers, alles met de hand, en het vlees op houtskool.",
      lagen: STANDAARD_LAGEN,
      knop: "Bestel de Vuur Classic",
      knopLink: "winkel",
    });
  const uren = () => block("openingstijden", { kop: "Openingstijden", regels: UREN });
  const cta = () => block("cta", { kop: "Honger gekregen?", tekst: "Bestel online om af te halen of te laten bezorgen, of reserveer een tafel.", knop: "Bestel online", knopLink: "winkel" });
  return [
    {
      id: "pvuur-home",
      slug: "",
      titel: "Home",
      seoTitel: "Burgerbar Vuur | Burgers van de houtskoolgrill in Zonnedorp",
      seoOmschrijving: "Burgers van de houtskoolgrill, verse friet en shakes. Bestel online om af te halen of te laten bezorgen, of reserveer een tafel.",
      blocks: [
        block("hero", { kop: "Gegrild op echt vuur.", tekst: "Burgers van vers gedraaid rundvlees, op houtskool gegrild en op een brioche van de bakker om de hoek. Eet bij ons, haal af of laat bezorgen.", knop: "Bestel online", knopLink: "winkel", foto: foto("vlam") }),
        burger(),
        block("diensten", {
          kop: "Wat mag het zijn?",
          items: [
            { titel: "Burgers", tekst: "Van de Vuur Classic tot de dubbele smash: elke dag vers van de grill.", foto: foto("smash") },
            { titel: "Friet en sides", tekst: "Verse friet, uienringen en loaded fries met onze eigen sauzen.", foto: foto("friet") },
            { titel: "Shakes", tekst: "Dik, koud en met echt ijs: vanille, aardbei of chocolade.", foto: foto("aardbei") },
            { titel: "Afhalen en bezorgen", tekst: "Bestel online en haal af, of laat bezorgen in Zonnedorp en omgeving.", foto: foto("bbq") },
            { titel: "Groepen en feestjes", tekst: "Verjaardag of teamuitje? De lange tafel is van jullie.", foto: foto("plank") },
            { titel: "Voor de kleintjes", tekst: "Een kleine burger met friet en een verrassing.", foto: foto("kids") },
          ],
        }),
        block("producten", { kop: "Het menu", tekst: "Kies je burger, je bakgraad en je saus. Alles gaat in je winkelmand; je rekent af wanneer je klaar bent.", categorie: "", aantal: 8 }),
        block("uitgelicht", { productId: "pvuur000smash", kop: "Favoriet van de zaak", tekst: "", fotoLinks: false }),
        block("usps", {
          kop: "Waarom het bij Vuur anders smaakt.",
          items: [
            { titel: "Echt houtskool", tekst: "Geen gasgrill: de rooksmaak proef je in elke hap." },
            { titel: "Vers gedraaid", tekst: "Elke ochtend draaien we het vlees zelf, van een boer uit de streek." },
            { titel: "Alles zelf gemaakt", tekst: "Van de sauzen tot de augurken: alles uit onze eigen keuken." },
          ],
        }),
        reserveren(),
        ...(galerij.length >= 2 ? [block("galerij", { kop: "Sfeer en smaak", fotos: galerij })] : []),
        block("reviews", {
          kop: "Wat gasten zeggen (voorbeeld)",
          items: [
            { naam: "Voorbeeldgast", tekst: "De beste burger van de regio. Die rooksmaak, en de friet is echt vers.", sterren: 5 },
            { naam: "Voorbeeldgast", tekst: "Online besteld en binnen een half uur bezorgd, nog warm. Top!", sterren: 5 },
            { naam: "Voorbeeldgast", tekst: "Met tien man aan de lange tafel gezeten. Gezellig, snel en heel lekker.", sterren: 5 },
          ],
        }),
        uren(),
        cta(),
      ],
    },
    {
      id: "pvuur-menu",
      slug: "menu",
      titel: "Menu",
      seoTitel: "Menu | Burgerbar Vuur",
      seoOmschrijving: "Burgers, friet, sides en shakes. Bestel online om af te halen of te laten bezorgen.",
      blocks: [block("producten", { kop: "Het hele menu", tekst: "Bestel online om af te halen of te laten bezorgen. In de winkel zoek en filter je op alles.", categorie: "", aantal: 24 }), burger(), cta()],
    },
    {
      id: "pvuur-over",
      slug: "over-ons",
      titel: "Over ons",
      seoTitel: "Over Burgerbar Vuur",
      seoOmschrijving: "Een burgerbar met een houtskoolgrill, vers gedraaid vlees en alles zelf gemaakt.",
      blocks: [
        block("tekstFoto", { kop: "Begonnen met één grill", tekst: "Burgerbar Vuur begon als foodtruck met één houtskoolgrill. Nu staan we aan het plein van Zonnedorp, maar het idee is hetzelfde: goed vlees, echt vuur en geen haast.\n\nOnze sauzen maken we zelf, de brioche komt van de bakker om de hoek en de friet snijden we elke ochtend vers.", foto: foto("chef"), fotoLinks: false }),
        block("tekstFoto", { kop: "Een team dat graag gastheer is", tekst: "In de keuken en de bediening werken vaste krachten en flexwerkers die we via ZekerFlex vinden. Zo staan er op vrijdag en zaterdag altijd genoeg handen klaar.", foto: foto("vrienden"), fotoLinks: true }),
        ...(foto("grill") ? [block("galerij", { kop: "Aan de grill", fotos: [foto("grill"), foto("dubbel"), foto("toren")].filter((f): f is string => Boolean(f)) })] : []),
        cta(),
      ],
    },
    {
      id: "pvuur-werken",
      slug: "werken-bij",
      titel: "Werken bij",
      seoTitel: "Werken bij Burgerbar Vuur",
      seoOmschrijving: "Grillmeester, bediening of afwas: kijk welke diensten er openstaan en reageer met één klik.",
      blocks: [block("vacatures", { kop: "Werken bij Vuur", tekst: "Grillmeester, bediening of afwas: we zoeken altijd mensen met zin in een goede avond. Bekijk de open diensten en reageer met één klik.", aantal: 6 }), cta()],
    },
    {
      id: "pvuur-contact",
      slug: "contact",
      titel: "Contact",
      seoTitel: "Contact en reserveren | Burgerbar Vuur",
      seoOmschrijving: "Reserveer een tafel of stel je vraag. We reageren dezelfde dag.",
      blocks: [reserveren(), block("contact", { kop: "Een vraag?", tekst: "Over een groep, een allergie of een feestje: laat het weten, we reageren dezelfde dag.", formulier: true }), uren(), block("faq", { kop: "Veelgestelde vragen", items: FAQ })],
    },
  ];
}

const BAKGRAAD = { naam: "Bakgraad", waarden: ["Medium", "Doorbakken"] };
const BROODJE = { naam: "Broodje", waarden: ["Brioche", "Glutenvrij"] };
const SAUS = { naam: "Saus", waarden: ["Mayonaise", "Truffelmayo", "Ketchup", "Chilisaus", "Geen saus"] };

/** Het menu als webshop: burgers, friet en sides, shakes; met keuzes, een aanbieding, weinig voorraad en iets dat op is. */
export function burgerWinkel(foto: (k: BurgerFoto) => string | null): Winkel {
  const p = (id: string, naam: string, categorie: string, prijsCents: number, korteTekst: string, omschrijving: string, f: BurgerFoto, extra: Partial<SiteProduct> = {}): SiteProduct => {
    const m = foto(f);
    return { id, naam, slug: slugify(naam), prijsCents, oudePrijsCents: null, korteTekst, omschrijving, fotos: m ? [m] : [], categorie, zichtbaar: true, uitverkocht: false, ...extra };
  };
  return {
    producten: [
      p("pvuur0classic", "Vuur Classic", "Burgers", 1250, "Rundvlees, cheddar, sla, tomaat en rode ui", "Onze klassieker: 180 gram vers gedraaid rundvlees van de houtskoolgrill, belegen cheddar, ijsbergsla, tomaat, rode ui en onze eigen burgersaus, op een brioche met sesam.", "classic", { opties: [BAKGRAAD, BROODJE] }),
      p("pvuur000smash", "Double Smash", "Burgers", 1595, "Twee smashburgers met dubbele kaas", "Twee platgedrukte burgers met knapperige randjes, dubbele cheddar, augurk en smashsaus. Voor de echte honger.", "smash", { opties: [BROODJE] }),
      p("pvuur00000bbq", "Bacon BBQ", "Burgers", 1495, "Met krokant spek en rokerige barbecuesaus", "Rundvlees van de grill met krokant spek, cheddar, gefrituurde uitjes en onze rokerige barbecuesaus.", "bbq", { opties: [BAKGRAAD, BROODJE] }),
      p("pvuur0truffel", "Truffel Deluxe", "Burgers", 1750, "Met truffelmayo, rucola en oude kaas", "Rundvlees met truffelmayonaise, rucola, oude kaas en gekarameliseerde ui. Deze week in de aanbieding.", "truffel", { oudePrijsCents: 1950, opties: [BAKGRAAD, BROODJE] }),
      p("pvuur00spicy", "Spicy Jalapeño", "Burgers", 1395, "Met jalapeño, pepperjack en chilimayo", "Voor wie van pittig houdt: jalapeño, pepperjack-kaas en onze chilimayonaise. Vandaag op, morgen weer vers.", "spicy", { uitverkocht: true }),
      p("pvuur0veggie", "Veggie Vuur", "Burgers", 1350, "Burger van zwarte bonen en geroosterde paprika", "Een stevige burger van zwarte bonen, geroosterde paprika en ui, met avocado, sla en tomaat. Vegetarisch, en op verzoek vegan.", "veggie", { opties: [BROODJE] }),
      p("pvuur000kids", "Kids burger met friet", "Burgers", 795, "Een kleine burger, friet en een verrassing", "Een kleine burger met kaas, een bakje friet en een verrassing. Voor kinderen tot twaalf jaar.", "kids"),
      p("pvuur00friet", "Verse friet", "Friet en sides", 395, "Elke ochtend vers gesneden", "Verse friet van Nederlandse aardappelen, twee keer gebakken voor een knapperige buitenkant.", "friet", { opties: [SAUS] }),
      p("pvuur0loaded", "Loaded fries", "Friet en sides", 695, "Met cheddarsaus, spek en lente-ui", "Verse friet met warme cheddarsaus, krokant spek, jalapeño en lente-ui.", "loaded"),
      p("pvuur0ringen", "Uienringen", "Friet en sides", 495, "Knapperig gefrituurd, met chilisaus", "Dikke uienringen in een krokant beslag, met een bakje chilisaus.", "ringen"),
      p("pvuurbox", "Snackbox om te delen", "Friet en sides", 995, "Friet, uienringen en kipnuggets", "Een grote box om te delen: friet, uienringen en kipnuggets met drie sauzen.", "snackbox", { voorraad: 4 }),
      p("pvuur00shake", "Milkshake", "Shakes en drinken", 550, "Dik, koud en met echt ijs", "Een dikke milkshake van echt roomijs, met slagroom.", "aardbei", { opties: [{ naam: "Smaak", waarden: ["Aardbei", "Vanille", "Chocolade"] }] }),
      p("pvuur0vanille", "Vanilleshake met karamel", "Shakes en drinken", 595, "Vanille-ijs met een laag zoute karamel", "Romig vanille-ijs met een laag zoute karamel onderin.", "vanille"),
      p("pvuur0000duo", "Shake-duo om te delen", "Shakes en drinken", 995, "Twee shakes: aardbei en banaan", "Twee milkshakes om te delen: aardbei en banaan, met verse aardbeien.", "duo"),
    ],
    bestellen: true,
    levering: { afhalen: true, bezorgen: true, bezorgkostenCents: 295, gratisVanafCents: 2500 },
    betaalTekst: "Je betaalt bij het afhalen of aan de bezorger, contant of met pin.",
  };
}
