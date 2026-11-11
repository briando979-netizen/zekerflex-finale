// ---------------------------------------------------------------------------
// De fotobibliotheek voor marketing en sociale media: échte foto's (geen illustraties) van jonge,
// diverse mensen aan het werk en tijdens een dienst, voor acties, banners, advertenties en berichten.
// Alles ligt in public/marketing/foto/, zelf gehost, met bron en licentie in CREDITS.md daar
// (Pexels License: vrij commercieel gebruik, geen naamsvermelding vereist). Puur (geen fs, geen prisma),
// zodat ook de browser en tests dit bestand mogen lezen; tests/marketing-fotos.test.ts bewaakt dat elk
// bestand bestaat, een JPEG is en in CREDITS.md staat.
// ---------------------------------------------------------------------------

export type FotoThema = "horeca" | "logistiek" | "bezorgen" | "retail" | "team" | "jong" | "app" | "zorg" | "rijschool";

export interface Foto {
  /** bestandsnaam zonder map en zonder .jpg */
  slug: string;
  thema: FotoThema;
  /** wat er te zien is, voor schermlezers (gewoon Nederlands) */
  alt: string;
  /** Pexels-nummer, voor de CREDITS */
  pexels: number;
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
  { slug: "zorg-bewoners", thema: "zorg", pexels: 18429308, alt: "Een zorgmedewerker buigt vriendelijk naar bewoners aan tafel", trefwoorden: ["zorg", "verpleeg", "bewoners"] },
  { slug: "zorg-patient", thema: "zorg", pexels: 18459702, alt: "Een zorgmedewerker praat met een patiënt in een lichte kamer", trefwoorden: ["zorg", "thuiszorg", "patiënt", "verpleeg"] },
];

export function fotoPad(f: Pick<Foto, "slug">): string {
  return `${FOTO_MAP}/${f.slug}.jpg`;
}

export function fotosVan(thema: FotoThema): Foto[] {
  return FOTOS.filter((f) => f.thema === thema);
}
