// ---------------------------------------------------------------------------
// De fotobibliotheek voor marketing en sociale media: échte foto's (geen illustraties) van jonge,
// diverse mensen aan het werk en tijdens een dienst, voor acties, banners, advertenties en berichten.
// Alles ligt in public/marketing/foto/, zelf gehost, met bron en licentie in CREDITS.md daar
// (Pexels License: vrij commercieel gebruik, geen naamsvermelding vereist). Puur (geen fs, geen prisma),
// zodat ook de browser en tests dit bestand mogen lezen; tests/marketing-fotos.test.ts bewaakt dat elk
// bestand bestaat, een JPEG is en in CREDITS.md staat.
// ---------------------------------------------------------------------------

export type FotoThema = "horeca" | "logistiek" | "bezorgen" | "retail" | "team" | "jong" | "app" | "zorg" | "rijschool" | "schoonmaak";

export interface Foto {
  /** bestandsnaam zonder map en zonder .jpg */
  slug: string;
  thema: FotoThema;
  /** wat er te zien is, voor schermlezers (gewoon Nederlands) */
  alt: string;
  /** Pexels-nummer, voor de CREDITS; ontbreekt bij een eigen beeld */
  pexels?: number;
  /** een eigen campagnebeeld (17 nov 2026, gemaakt met Gemini uit alleen tekst): geen fotobank, de persoon bestaat niet */
  eigen?: true;
  /** de foto is staand (4:5) */
  staand?: boolean;
  /** woorden in een bericht waarbij de foto past */
  trefwoorden: readonly string[];
}

export const FOTO_MAP = "/marketing/foto";

export const FOTOTHEMA_NAAM: Record<FotoThema, string> = {
  horeca: "Horeca",
  logistiek: "Magazijn en logistiek",
  bezorgen: "Bezorgen",
  retail: "Winkel en retail",
  team: "Team en succes",
  jong: "Jong en energiek",
  app: "De app",
  zorg: "Zorg",
  rijschool: "Rijschool",
  schoonmaak: "Schoonmaak",
};

export const FOTOS: readonly Foto[] = [
  { slug: "horeca-serveerster-lacht", thema: "horeca", pexels: 4350094, alt: "Een serveerster in een grijze schort lacht met gasten in een café", trefwoorden: ["horeca", "bediening", "café", "cafe", "gast"] },
  { slug: "horeca-gasten-bediening", thema: "horeca", pexels: 4350104, alt: "Bediening praat lachend met twee gasten aan tafel", trefwoorden: ["horeca", "restaurant", "bediening", "gast"] },
  { slug: "horeca-barista-team", thema: "horeca", pexels: 4354193, alt: "Drie baristas in schorten staan lachend naast elkaar", trefwoorden: ["barista", "koffie", "horeca", "team"] },
  { slug: "horeca-barista-laptop", thema: "horeca", pexels: 4350040, alt: "Twee baristas kijken samen lachend op een laptop", trefwoorden: ["barista", "koffie", "pauze", "app"] },
  { slug: "horeca-schort-portret", thema: "horeca", pexels: 6205635, staand: true, alt: "Een jonge medewerker in een schort lacht in de camera", trefwoorden: ["horeca", "bijbaan", "student"] },
  { slug: "horeca-keuken-plezier", thema: "horeca", pexels: 6937434, alt: "Twee koks hebben plezier in een drukke keuken", trefwoorden: ["keuken", "kok", "horeca", "plezier"] },
  { slug: "horeca-keuken-team", thema: "horeca", pexels: 6937464, alt: "Een keukenbrigade maakt samen gerechten klaar", trefwoorden: ["keuken", "kok", "brigade"] },
  { slug: "horeca-terras-bediening", thema: "horeca", pexels: 29686525, alt: "Een ober serveert een gerecht aan vrienden op een terras met lichtjes", trefwoorden: ["terras", "restaurant", "ober", "bediening", "avond"] },
  { slug: "logistiek-magazijn-klembord", thema: "logistiek", pexels: 6169652, alt: "Een magazijnmedewerker met klembord kijkt vriendelijk in de camera", trefwoorden: ["magazijn", "logistiek", "orderpicker"] },
  { slug: "logistiek-magazijn-dozen", thema: "logistiek", pexels: 8069547, staand: true, alt: "Een magazijnmedewerker in een veiligheidsvest tussen stapels dozen", trefwoorden: ["magazijn", "dozen", "logistiek", "distributie"] },
  { slug: "logistiek-magazijn-doos", thema: "logistiek", pexels: 8069548, alt: "Een lachende magazijnmedewerker draagt een doos", trefwoorden: ["magazijn", "doos", "logistiek"] },
  { slug: "bezorg-scooter", thema: "bezorgen", pexels: 6867941, alt: "Een bezorger op een scooter met een bezorgtas en pakketten", trefwoorden: ["bezorg", "scooter", "pakket", "maaltijd"] },
  { slug: "bezorg-fiets", thema: "bezorgen", pexels: 6868462, alt: "Een bezorger op de fiets met een stapel pakketten", trefwoorden: ["bezorg", "fiets", "pakket"] },
  { slug: "bezorg-bus", thema: "bezorgen", pexels: 7363098, alt: "Een bezorger staat met een doos voor zijn bestelbus", trefwoorden: ["bezorg", "bus", "chauffeur", "pakket"] },
  { slug: "bezorg-overdracht", thema: "bezorgen", pexels: 7843932, alt: "Een pakket wordt overhandigd door een fietskoerier in een geel vest", trefwoorden: ["bezorg", "koerier", "pakket", "fiets"] },
  { slug: "bezorg-fietstas", thema: "bezorgen", pexels: 13456094, staand: true, alt: "Een jonge bezorger op de fiets met een bezorgtas op haar rug", trefwoorden: ["bezorg", "fiets", "maaltijd"] },
  { slug: "retail-winkelhulp", thema: "retail", pexels: 8422707, alt: "Een winkelmedewerker helpt twee klanten in een buurtwinkel", trefwoorden: ["retail", "winkel", "klant", "supermarkt"] },
  { slug: "retail-kassa", thema: "retail", pexels: 6545444, alt: "Een winkelmedewerker praat lachend met een klant bij de kassa", trefwoorden: ["retail", "kassa", "winkel", "klant"] },
  { slug: "retail-toonbank", thema: "retail", pexels: 3738387, alt: "Een medewerker staat achter de toonbank van een lichte winkel", trefwoorden: ["winkel", "toonbank", "retail"] },
  { slug: "team-highfive-raam", thema: "team", pexels: 3184427, alt: "Een team geeft elkaar een high five bij een groot raam", trefwoorden: ["team", "succes", "samen", "collega"] },
  { slug: "team-highfive-tafel", thema: "team", pexels: 6457610, alt: "Collega's lachen en geven elkaar een high five aan tafel", trefwoorden: ["team", "succes", "high five"] },
  { slug: "team-highfive-geel", thema: "team", pexels: 8204405, alt: "Een vrouw in een gele blouse geeft collega's een high five", trefwoorden: ["team", "succes", "vrolijk"] },
  { slug: "team-highfive-callcenter", thema: "team", pexels: 8866744, alt: "Een team met headsets geeft elkaar een high five", trefwoorden: ["team", "kantoor", "klantenservice", "succes"] },
  { slug: "team-juichen", thema: "team", pexels: 7964350, alt: "Collega's juichen met de armen in de lucht", trefwoorden: ["team", "feest", "succes", "juichen"] },
  { slug: "team-handen", thema: "team", pexels: 8145344, alt: "Een lachende vrouw met handen die een high five geven boven haar hoofd", trefwoorden: ["team", "samen", "succes"] },
  { slug: "jong-vrienden-zon", thema: "jong", pexels: 3063478, alt: "Een groep jonge vrienden lacht in de zon", trefwoorden: ["jong", "student", "vrienden", "bijbaan"] },
  { slug: "jong-vrienden-park", thema: "jong", pexels: 3777727, alt: "Vier jonge vrienden zitten lachend in een park", trefwoorden: ["jong", "student", "vrienden", "vrij"] },
  { slug: "jong-vrienden-buiten", thema: "jong", pexels: 9287491, alt: "Een groep jonge mensen lacht buiten met een envelop in de hand", trefwoorden: ["jong", "vrienden", "uitbetaald", "loon"] },
  { slug: "jong-vieren", thema: "jong", pexels: 6184938, staand: true, alt: "Jonge mensen vieren feest met confetti en lichtjes", trefwoorden: ["feest", "vieren", "jong", "evenement"] },
  { slug: "jong-kleurrook", thema: "jong", pexels: 31564363, alt: "Jongeren dansen in groene kleurrook op straat", trefwoorden: ["actie", "evenement", "festival", "stunt"] },
  { slug: "app-telefoon-leeg", thema: "app", pexels: 9429449, alt: "Een lachende vrouw houdt een telefoon met leeg scherm omhoog", trefwoorden: ["app", "telefoon", "download"] },
  { slug: "app-telefoon-lacht", thema: "app", pexels: 3756618, alt: "Een vrouw toont lachend een telefoon, het scherm is leeg", trefwoorden: ["app", "telefoon", "klus"] },
  { slug: "app-telefoon-oranje", thema: "app", pexels: 3767404, alt: "Een vrouw in een oranje trui kijkt lachend op haar telefoon tegen een groene muur", trefwoorden: ["app", "telefoon", "melding"] },
  { slug: "app-telefoon-warm", thema: "app", pexels: 30677594, alt: "Een vrouw zwaait vrolijk met haar telefoon tegen een warme achtergrond", trefwoorden: ["app", "telefoon", "uitbetaald"] },
  { slug: "rijschool-achter-het-stuur", thema: "rijschool", pexels: 6816982, alt: "Een jonge vrouw in een rode jas zit lachend achter het stuur van een auto", trefwoorden: ["rijschool", "rijles", "rijbewijs", "auto", "leerling"] },
  { slug: "schoonmaak-uniform", thema: "schoonmaak", pexels: 9462636, staand: true, alt: "Twee schoonmaaksters in uniform lachen in de camera met een stofzuiger en een dweil", trefwoorden: ["schoonmaak", "schoonmaker", "kantoor", "huishouden"] },
  { slug: "zorg-bewoners", thema: "zorg", pexels: 18429308, alt: "Een zorgmedewerker buigt vriendelijk naar bewoners aan tafel", trefwoorden: ["zorg", "verpleeg", "bewoners"] },
  { slug: "zorg-patient", thema: "zorg", pexels: 18459702, alt: "Een zorgmedewerker praat met een patiënt in een lichte kamer", trefwoorden: ["zorg", "thuiszorg", "patiënt", "verpleeg"] },
  // Eigen campagnebeelden in één stijl (17 nov 2026): deze staan vooraan op de sector- en overzichtspagina's
  { slug: "campagne-barista", thema: "horeca", eigen: true, staand: true, alt: "Een barista schenkt melk in een cappuccino achter de koffiebar", trefwoorden: ["horeca", "barista", "koffie"] },
  { slug: "campagne-tap", thema: "horeca", eigen: true, staand: true, alt: "Een barman tapt een biertje achter een houten bar", trefwoorden: ["horeca", "bar", "tap", "bediening"] },
  { slug: "campagne-kok", thema: "horeca", eigen: true, staand: true, alt: "Een kok met een gestreept schort leunt op de werkbank in een open keuken", trefwoorden: ["horeca", "kok", "keuken"] },
  { slug: "campagne-bediening", thema: "horeca", eigen: true, staand: true, alt: "Een medewerker leunt op de bar terwijl collega's met borden langslopen", trefwoorden: ["horeca", "bediening", "restaurant"] },
  { slug: "campagne-scanner", thema: "logistiek", eigen: true, staand: true, alt: "Een magazijnmedewerker scant een doos tussen hoge stellingen", trefwoorden: ["magazijn", "logistiek", "orderpicker", "scanner"] },
  { slug: "campagne-steekkar", thema: "logistiek", eigen: true, staand: true, alt: "Een medewerker duwt een steekkar met dozen door een magazijn", trefwoorden: ["magazijn", "logistiek", "dozen"] },
  { slug: "campagne-inpakken", thema: "logistiek", eigen: true, staand: true, alt: "Een medewerker plakt een kartonnen doos dicht met tape", trefwoorden: ["magazijn", "inpakken", "logistiek"] },
  { slug: "campagne-bestelbus", thema: "bezorgen", eigen: true, staand: true, alt: "Een bezorger zit in de open laadruimte van een bestelbus tussen de dozen", trefwoorden: ["bezorg", "bus", "chauffeur", "pakket"] },
  { slug: "campagne-kledingrek", thema: "retail", eigen: true, staand: true, alt: "Een winkelmedewerker hangt kleding aan een rek", trefwoorden: ["retail", "winkel", "kleding"] },
  { slug: "campagne-vouwen", thema: "retail", eigen: true, staand: true, alt: "Een winkelmedewerker vouwt shirts op de toonbank", trefwoorden: ["retail", "winkel", "toonbank"] },
  { slug: "campagne-schap", thema: "retail", eigen: true, staand: true, alt: "Een medewerker vult een schap met flessen", trefwoorden: ["retail", "supermarkt", "vakkenvuller", "schap"] },
  { slug: "campagne-festival-crew", thema: "jong", eigen: true, staand: true, alt: "Een crewlid staat met de armen over elkaar voor een festivalpodium", trefwoorden: ["evenement", "festival", "crew"] },
  { slug: "campagne-podium", thema: "jong", eigen: true, staand: true, alt: "Een crewlid in een regenjack staat voor een podium in opbouw", trefwoorden: ["evenement", "festival", "opbouw"] },
  { slug: "campagne-crew-pauze", thema: "team", eigen: true, staand: true, alt: "Twee crewleden zitten op de rand van een podium tijdens een pauze", trefwoorden: ["evenement", "team", "crew", "pauze"] },
  { slug: "campagne-ramen", thema: "schoonmaak", eigen: true, staand: true, alt: "Een schoonmaker maakt een glazen wand schoon met een trekker", trefwoorden: ["schoonmaak", "glazenwasser", "kantoor"] },
  { slug: "campagne-hotelbed", thema: "schoonmaak", eigen: true, staand: true, alt: "Een medewerker maakt een hotelbed op met wit beddengoed", trefwoorden: ["schoonmaak", "hotel", "housekeeping"] },
  { slug: "campagne-ondernemer", thema: "team", eigen: true, staand: true, alt: "Een ondernemer in een donker pak zit op een trap tussen kantoorgebouwen", trefwoorden: ["werkgever", "ondernemer", "bedrijf"] },
  { slug: "campagne-rooster", thema: "team", eigen: true, staand: true, alt: "Een eigenaar bekijkt een rooster op een tablet terwijl zijn team de zaak klaarmaakt", trefwoorden: ["werkgever", "rooster", "planning", "personeel"] },
  { slug: "campagne-eigenaar", thema: "team", eigen: true, staand: true, alt: "Een eigenaar zit met een tablet in zijn restaurant, het team dekt de tafels", trefwoorden: ["werkgever", "restaurant", "personeel"] },
  { slug: "campagne-bouw", thema: "team", eigen: true, staand: true, alt: "Een medewerker met een witte helm onder de arm staat op een bouwplaats", trefwoorden: ["bouw", "techniek", "werkgever"] },
  { slug: "campagne-deuropening", thema: "jong", eigen: true, staand: true, alt: "Een medewerker met een dienblad onder de arm staat in de deuropening van een café", trefwoorden: ["horeca", "bijbaan", "student", "flexwerker"] },
  { slug: "campagne-bezorger", thema: "bezorgen", eigen: true, staand: true, alt: "Een bezorger met een grote rugzak zit op de stoeprand met zijn telefoon", trefwoorden: ["bezorg", "maaltijd", "app", "telefoon"] },
  { slug: "campagne-aanbellen", thema: "bezorgen", eigen: true, staand: true, alt: "Een bezorger belt aan bij een voordeur met een papieren tas in de hand", trefwoorden: ["bezorg", "pakket", "fiets"] },
  { slug: "campagne-autowassen", thema: "team", eigen: true, staand: true, alt: "Een medewerker met een pet wast een zwarte auto met een spons vol schuim", trefwoorden: ["auto", "wasstraat", "autopoetser"] },
  { slug: "campagne-monteur", thema: "team", eigen: true, staand: true, alt: "Een monteur draait met een ratelsleutel een bout vast op een stalen constructie", trefwoorden: ["bouw", "techniek", "monteur", "montage"] },
  { slug: "campagne-klembord", thema: "team", eigen: true, staand: true, alt: "Een medewerker met werkhandschoenen schrijft op een klembord naast een stapel steigerbuizen", trefwoorden: ["bouw", "steiger", "werkgever", "administratie"] },
  { slug: "campagne-wasstraat", thema: "team", eigen: true, staand: true, alt: "Een medewerker wast een zwarte auto met een spons in een wasstraat", trefwoorden: ["auto", "wasstraat", "autopoetser"] },
  { slug: "campagne-zorg", thema: "zorg", eigen: true, staand: true, alt: "Een zorgmedewerker staat met een rolstoel in de gang van een woonzorgcentrum", trefwoorden: ["zorg", "verpleeg", "thuiszorg", "bewoners"] },
  { slug: "campagne-receptie", thema: "team", eigen: true, staand: true, alt: "Een receptioniste staat met een laptop achter een houten balie in een kantoor", trefwoorden: ["kantoor", "receptie", "administratie"] },
  { slug: "campagne-beveiliging", thema: "team", eigen: true, staand: true, alt: "Een beveiliger met een portofoon staat bij de glazen ingang van een kantoorgebouw", trefwoorden: ["beveiliging", "beveiliger", "portier"] },
  { slug: "campagne-kinderopvang", thema: "zorg", eigen: true, staand: true, alt: "Een pedagogisch medewerker zit op haar hurken met houten blokken in een groepsruimte", trefwoorden: ["kinderopvang", "bso", "opvang", "onderwijs"] },
  { slug: "campagne-kas", thema: "team", eigen: true, staand: true, alt: "Een medewerker draagt een krat tomaten tussen de planten in een kas", trefwoorden: ["agrarisch", "tuinbouw", "kas", "oogst"] },
  { slug: "campagne-promotie", thema: "jong", eigen: true, staand: true, alt: "Een promotiemedewerker houdt een dienblad met proefbekertjes vast in een winkelstraat", trefwoorden: ["promotie", "promotor", "sampling"] },
  { slug: "campagne-rijles", thema: "rijschool", eigen: true, staand: true, alt: "Een rij-instructeur leunt met de autosleutel in zijn hand tegen het portier van een witte lesauto", trefwoorden: ["rijschool", "rijles", "rijbewijs", "auto", "instructeur"] },
  { slug: "campagne-webwinkel", thema: "retail", eigen: true, staand: true, alt: "Een winkeleigenaar zit met een laptop en een pakketje aan de toonbank van haar winkel", trefwoorden: ["website", "webshop", "winkel", "ondernemer"] },
];

export function fotoPad(f: Pick<Foto, "slug">): string {
  return `${FOTO_MAP}/${f.slug}.jpg`;
}

export function fotosVan(thema: FotoThema): Foto[] {
  return FOTOS.filter((f) => f.thema === thema);
}

/** Welke foto's bij welke sector horen (sleutels uit lib/seo-sectors.ts). */
const SECTOR_FOTOS: Record<string, readonly string[]> = {
  horeca: ["campagne-tap", "campagne-barista", "campagne-kok", "campagne-bediening", "campagne-deuropening"],
  logistiek: ["campagne-scanner", "campagne-steekkar", "campagne-inpakken", "campagne-bestelbus"],
  retail: ["campagne-kledingrek", "campagne-vouwen", "campagne-schap"],
  evenementen: ["campagne-festival-crew", "campagne-podium", "campagne-crew-pauze"],
  schoonmaak: ["campagne-ramen", "campagne-hotelbed"],
  promotie: ["campagne-promotie"],
  bezorging: ["campagne-bezorger", "campagne-aanbellen", "campagne-bestelbus"],
  // de overzichtspagina's: bedrijven die personeel zoeken, en werkers die klussen zoeken
  algemeen: ["campagne-ondernemer", "campagne-rooster", "campagne-eigenaar", "campagne-bouw", "campagne-klembord", "campagne-monteur"],
  freelance: ["campagne-deuropening", "campagne-bezorger", "campagne-aanbellen", "campagne-autowassen", "campagne-wasstraat", "campagne-barista", "campagne-scanner"],
};

/** Een foto voor een sectorpagina; de seed (bijv. de stad) kiest er één uit, zodat stadspagina's niet allemaal dezelfde tonen. */
export function sectorFoto(sector: string, seed: string | number = 0): Foto | undefined {
  if (!Object.hasOwn(SECTOR_FOTOS, sector)) return undefined;
  const lijst = SECTOR_FOTOS[sector] ?? [];
  if (lijst.length === 0) return undefined;
  const n = typeof seed === "number" ? seed : [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  return FOTOS.find((f) => f.slug === lijst[n % lijst.length]);
}

/** De foto voor de kop van een vaste openbare pagina (alleen pagina's waar een foto de kop sterker maakt; gereedschap en juridische pagina's niet). */
const PAGINA_FOTOS: Record<string, string> = {
  contact: "campagne-receptie",
  abonnementen: "campagne-rooster",
  prijzen: "campagne-eigenaar",
  beveiliging: "campagne-beveiliging",
  kennis: "campagne-klembord",
  klussen: "campagne-bezorger",
  "voor-bureaus": "campagne-ondernemer",
  "sales-partner": "campagne-crew-pauze",
  demo: "campagne-rooster",
  intercedenten: "campagne-eigenaar",
  // /uitzendpartner (21 nov 2026): voor uitzendbureaus die hun klussen op ZekerFlex zetten
  uitzendpartner: "campagne-rooster",
  // /starten-als-uitzendkracht (21 nov 2026): werken via een uitzendbureau, uitzendklussen in de app
  "starten-als-uitzendkracht": "campagne-steekkar",
  verkopen: "campagne-inpakken",
  rekentools: "campagne-vouwen",
  "review-check": "campagne-bediening",
  producten: "campagne-receptie",
  developers: "campagne-monteur",
  nieuwsbrief: "campagne-aanbellen",
  uitleg: "campagne-barista",
  leren: "campagne-bezorger",
  "leren-bedrijven": "campagne-eigenaar",
  "producten-flexcompliance-api": "campagne-klembord",
  "producten-recruitflex-ai": "campagne-festival-crew",
  "producten-sovereignops": "campagne-scanner",
};

export function paginaFoto(pagina: string): Foto | undefined {
  if (!Object.hasOwn(PAGINA_FOTOS, pagina)) return undefined;
  return FOTOS.find((f) => f.slug === PAGINA_FOTOS[pagina]);
}
