// ---------------------------------------------------------------------------
// The cities that get their own landing pages ("freelance werk <stad>",
// "personeel inhuren <stad>"). Each page shows the live open klussen within
// RADIUS_KM, so the pages carry real, changing content — not a copied text
// with the city name swapped in.
// ---------------------------------------------------------------------------

export interface City {
  slug: string;
  name: string;
  province: string;
  lat: number;
  lng: number;
  /** the work that's typically in demand there — used in the page copy */
  sectors: string[];
  /** one line of local context, unique per city */
  local: string;
}

export const RADIUS_KM = 25;

export const CITIES: City[] = [
  { slug: "amsterdam", name: "Amsterdam", province: "Noord-Holland", lat: 52.3676, lng: 4.9041, sectors: ["horeca", "hotels", "evenementen", "logistiek rond Schiphol"], local: "Van hotels aan de grachten tot de bagagekelders van Schiphol: in en rond Amsterdam is er elke dag vraag naar flexibele handen." },
  { slug: "rotterdam", name: "Rotterdam", province: "Zuid-Holland", lat: 51.9244, lng: 4.4777, sectors: ["haven en logistiek", "horeca", "productie", "schoonmaak"], local: "De haven, de distributiecentra en een groeiende horeca maken Rotterdam een van de grootste flexmarkten van het land." },
  { slug: "den-haag", name: "Den Haag", province: "Zuid-Holland", lat: 52.0705, lng: 4.3007, sectors: ["horeca", "evenementen", "schoonmaak", "retail"], local: "Congressen, het strand van Scheveningen en een drukke binnenstad zorgen in Den Haag voor veel korte klussen." },
  { slug: "utrecht", name: "Utrecht", province: "Utrecht", lat: 52.0907, lng: 5.1214, sectors: ["evenementen", "retail", "logistiek", "horeca"], local: "Beurzen in de Jaarbeurs, Hoog Catharijne en de logistiek langs de A2 en A12 maken Utrecht een knooppunt voor flexwerk." },
  { slug: "eindhoven", name: "Eindhoven", province: "Noord-Brabant", lat: 51.4416, lng: 5.4697, sectors: ["productie en techniek", "logistiek", "horeca"], local: "De Brainport-regio draait op productie, techniek en logistiek — en heeft structureel extra mensen nodig." },
  { slug: "groningen", name: "Groningen", province: "Groningen", lat: 53.2194, lng: 6.5665, sectors: ["horeca", "zorg", "retail", "evenementen"], local: "Een studentenstad met een levendige horeca en veel zorginstellingen: in Groningen zijn avond- en weekendklussen volop." },
  { slug: "tilburg", name: "Tilburg", province: "Noord-Brabant", lat: 51.5555, lng: 5.0913, sectors: ["logistiek en distributie", "productie", "horeca"], local: "Rond Tilburg liggen enkele van de grootste distributiecentra van Nederland — orderpicken en laden staan hier hoog op de lijst." },
  { slug: "almere", name: "Almere", province: "Flevoland", lat: 52.3508, lng: 5.2647, sectors: ["retail", "logistiek", "schoonmaak"], local: "Almere groeit hard; winkels, bouw en logistiek zoeken er steeds vaker flexibele krachten." },
  { slug: "breda", name: "Breda", province: "Noord-Brabant", lat: 51.5719, lng: 4.7683, sectors: ["logistiek", "horeca", "evenementen"], local: "Tussen Rotterdam en Antwerpen in is Breda een logistieke hotspot, met daarbij een bourgondische horeca." },
  { slug: "nijmegen", name: "Nijmegen", province: "Gelderland", lat: 51.8126, lng: 5.8372, sectors: ["zorg", "horeca", "evenementen", "retail"], local: "Van de Vierdaagse tot het Radboudumc: Nijmegen kent pieken waarin snel extra mensen nodig zijn." },
  { slug: "apeldoorn", name: "Apeldoorn", province: "Gelderland", lat: 52.2112, lng: 5.9699, sectors: ["logistiek", "retail", "zorg"], local: "Apeldoorn ligt centraal aan de A1 en A50 — handig voor logistiek en winkelketens die flexibel willen inroosteren." },
  { slug: "haarlem", name: "Haarlem", province: "Noord-Holland", lat: 52.3874, lng: 4.6462, sectors: ["horeca", "retail", "evenementen"], local: "Een historische binnenstad vol restaurants en winkels, en het strand van Zandvoort om de hoek." },
  { slug: "arnhem", name: "Arnhem", province: "Gelderland", lat: 51.9851, lng: 5.8987, sectors: ["evenementen", "zorg", "horeca", "retail"], local: "GelreDome, Burgers' Zoo en een groot ziekenhuis: Arnhem heeft wisselende vraag die zich goed met flexkrachten laat opvangen." },
  { slug: "enschede", name: "Enschede", province: "Overijssel", lat: 52.2215, lng: 6.8937, sectors: ["productie", "logistiek", "horeca"], local: "Twente combineert maakindustrie met logistiek richting Duitsland — veel werk in ploegendiensten." },
  { slug: "amersfoort", name: "Amersfoort", province: "Utrecht", lat: 52.1561, lng: 5.3878, sectors: ["retail", "logistiek", "schoonmaak"], local: "Centraal in het land, met veel hoofdkantoren en distributie: Amersfoort zoekt vooral betrouwbare dagkrachten." },
  { slug: "zaanstad", name: "Zaanstad", province: "Noord-Holland", lat: 52.4389, lng: 4.8276, sectors: ["voedselproductie", "logistiek", "schoonmaak"], local: "De Zaanstreek is van oudsher een voedselindustrie-regio; productie en inpak draaien hier dag en nacht." },
  { slug: "den-bosch", name: "'s-Hertogenbosch", province: "Noord-Brabant", lat: 51.6978, lng: 5.3037, sectors: ["horeca", "evenementen", "retail", "logistiek"], local: "Carnaval, Jazz in Duketown en een drukke binnenstad zorgen in Den Bosch voor seizoenspieken." },
  { slug: "zwolle", name: "Zwolle", province: "Overijssel", lat: 52.5168, lng: 6.083, sectors: ["logistiek", "retail", "zorg"], local: "Als knooppunt van het noordoosten heeft Zwolle veel distributie en een sterke winkel- en zorgsector." },
  { slug: "leiden", name: "Leiden", province: "Zuid-Holland", lat: 52.1601, lng: 4.497, sectors: ["zorg", "horeca", "evenementen"], local: "Het LUMC, de universiteit en een gezellige binnenstad: in Leiden gaat veel flexwerk naar zorg en horeca." },
  { slug: "maastricht", name: "Maastricht", province: "Limburg", lat: 50.8514, lng: 5.691, sectors: ["horeca", "hotels", "evenementen"], local: "Met de MECC-beurzen, veel hotels en internationale bezoekers is Maastricht dé horeca-stad van het zuiden." },
];

export function cityBySlug(slug: string): City | undefined {
  return CITIES.find((c) => c.slug === slug);
}
