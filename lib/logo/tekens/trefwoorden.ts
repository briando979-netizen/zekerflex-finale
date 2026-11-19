// ---------------------------------------------------------------------------
// Welk teken past bij een bedrijf? Een koppeling van woorden (Nederlands en
// gangbaar Engels) uit de bedrijfsnaam, de slogan en "wat voor bedrijf" naar de
// namen van tekens in lib/logo/tekens/phosphor-fill.json, met een standaard per
// soort bedrijf en per sfeer. Puur: alleen namen, geen tekengegevens (die blijven
// op de server). tests/logo-tekens.test.ts controleert dat elke naam bestaat en
// bewaakt een lijst gemeten missers.
//
// Liever GEEN teken uit de naam (dan volgt de soort bedrijf of de sfeer) dan een
// fout teken. Daarom telt een stam standaard alleen als HEEL woord: "recht" past
// niet bij "Utrecht", "haar" niet bij "Haarlem", "vers" niet bij "Versteeg". Wat
// ruimer mag, staat er uitdrukkelijk bij:
//   "fiets*"  het woord BEGINT met de stam (fietsenmaker, fietsshop)
//   "*bouw"   het woord EINDIGT op de stam (woningbouw)
//   "bloem+"  het hele woord, ook met een gewone uitgang (-en, -s, -e, -n, -je, -jes, -er, -ers)
// Plaatsnamen en het deel van een achternaam na "van", "den", "der", "ter" of
// "ten" tellen nooit mee ("Van den Berg Bouw" is geen bergsportwinkel).
// ---------------------------------------------------------------------------

export const TREFWOORDEN: readonly (readonly [teken: string, ...stammen: string[]])[] = [
  ["bicycle", "fiets*", "bike+", "bikes", "cycling", "wieler*", "rijwiel*"],
  ["motorcycle", "motor+", "motoren", "motorfiets*", "moto", "biker+"],
  ["scooter", "scooter+", "brommer+"],
  ["car-profile", "auto+", "auto's", "autobedrijf", "autogarage", "autoservice", "autoschade", "autohandel", "car", "cars", "garage*", "garagebedrijf", "occasion+", "apk", "rijschool", "rijles*"],
  ["steering-wheel", "chauffeur+", "chauffeurs*", "rijden", "drive", "driver+"],
  ["tire", "banden*", "wiel+", "tyre+", "tire+", "velgen"],
  ["truck", "transport*", "vracht*", "truck+", "trucking", "logistiek", "logistics", "koerier+", "koeriers*", "verhuis*", "verhuizer+", "verhuizingen"],
  ["van", "bestelbus+", "busje+"],
  ["taxi", "taxi+", "taxi's", "taxibedrijf", "taxicentrale"],
  ["airplane-tilt", "vliegen", "vliegtuig+", "reizen", "reisbureau", "travel", "vakantie+", "airlines", "aviation"],
  ["sailboat", "zeilen", "zeilboot", "zeilschool", "sailing", "jacht+", "jachthaven", "watersport*"],
  ["anchor", "anker+", "anchor+", "marine", "maritiem", "scheepvaart", "scheeps*"],
  ["rocket-launch", "raket+", "rocket+", "launch", "space", "spacewear", "ruimtevaart"],
  ["planet", "planeet", "planet+", "orbit", "galaxy", "cosmos", "kosmos"],
  ["globe-hemisphere-west", "wereld", "wereldwijd", "world", "worldwide", "globe", "global", "international", "internationaal"],
  ["compass-rose", "kompas", "compass", "noord*", "north", "koers"],
  ["mountains", "berg+", "bergen", "bergsport*", "bergtop", "mountain+", "alpen", "alpine", "peak+", "summit", "kaap", "rots+", "rocks"],
  ["tent", "tent+", "camping+", "kamperen", "outdoor"],
  ["campfire", "kampvuur", "bbq", "barbecue+", "grill", "grillroom"],
  ["tree-evergreen", "bos", "bossen", "woud", "forest", "dennen*", "spar", "pine"],
  ["tree", "boom", "bomen", "boomverzorging", "tree+", "hout", "houtbewerking", "houthandel", "wood", "woodworks", "timmer*"],
  ["tree-palm", "palm+", "strand", "strandtent", "beach", "tropical", "tropisch"],
  ["leaf", "blad", "leaf", "green", "eco", "bio", "biologisch", "natuur", "natuurlijk", "nature", "vegan"],
  ["plant", "plant+", "tuin+", "tuinen", "tuin*", "garden+", "hovenier+", "hoveniers*", "kweker+", "kwekerij"],
  ["flower-tulip", "tulp+", "bloem+", "bloemen*", "bloemist+", "bloemisterij", "*bloem", "flower+", "florist", "boeket+"],
  ["flower-lotus", "lotus", "yoga", "yogastudio", "zen", "spa", "wellness", "massage+", "massagepraktijk", "mindfulness"],
  ["sun", "zon", "zonne*", "sun", "sunny", "zomer", "summer"],
  ["moon-stars", "maan", "moon", "nacht", "night", "luna"],
  ["star-four", "ster+", "sterren", "star+", "nova", "stella", "astro"],
  ["sparkle", "glans", "shine", "sparkle", "glow", "poets*", "schoon", "clean", "cleaning"],
  ["lightning", "bliksem", "flits", "flash", "bolt", "thunder", "donder", "volt", "energie", "energy", "power", "elektra", "elektro*", "electric"],
  ["fire", "vuur", "fire", "vlam+", "flame+", "blaze", "haard+", "haarden", "kachel+"],
  ["drop", "water", "druppel+", "drop+", "aqua", "loodgieter+", "loodgieters*", "plumber+", "plumbing"],
  ["waves", "golven", "wave+", "zee", "sea", "ocean", "oceaan", "surf", "surfschool", "kust"],
  ["snowflake", "sneeuw", "snow", "ijs", "ice", "winter", "frost", "airco+", "airco's", "koeltechniek", "klimaattechniek"],
  ["person-simple-ski", "ski", "skischool", "wintersport*"],
  ["crown", "kroon", "crown+", "king+", "koning+", "konings*", "queen+", "royal", "royale", "koninklijk+", "prins", "prince", "majestic", "imperial", "regal"],
  ["diamond", "diamant+", "diamond+", "juwelier+", "juweliers*", "jewel+", "jewelry", "sieraden", "goud", "gold", "luxury"],
  ["sword", "zwaard", "sword+", "ridder+", "knight+", "warrior+"],
  ["shield-star", "schild", "shield", "guard", "bewaking", "beveiliging*", "security", "secure"],
  ["skull", "skull+", "schedel", "rebel+", "pirate+", "piraat"],
  ["ghost", "ghost+", "spook"],
  ["alien", "alien+", "ufo"],
  ["robot", "robot+", "robotics"],
  ["butterfly", "vlinder+", "butterfly"],
  ["bird", "vogel+", "bird+", "adelaar", "eagle+", "valk", "falcon+", "arend", "zwaluw", "phoenix", "feniks", "raaf", "raven"],
  ["feather", "veer", "veren", "feather+", "pluim"],
  ["paw-print", "poot", "paw+", "dieren*", "animal+", "wolf", "wolves", "leeuw", "lion+", "tijger", "tiger+", "bear+", "vos", "fox", "panter", "panther+"],
  ["dog", "hond+", "honden*", "dog+", "puppy", "trimsalon", "hondenuitlaat*"],
  ["cat", "kat", "katten*", "poes", "cat", "cats", "kitten+"],
  ["horse", "paard+", "paarden*", "horse+", "ruiter+", "ruitersport*", "manege", "pony"],
  ["cow", "koe", "koeien", "melkvee*", "zuivel", "boerderij", "farm"],
  ["fish", "vis", "vishandel", "viswinkel", "visboer", "fish", "sushi", "hengelsport*"],
  ["bread", "brood", "bread", "bakker+", "bakkerij+", "bakkers*", "*bakker", "*bakkerij", "bakery"],
  ["cake", "taart+", "taarten*", "cake+", "gebak", "patisserie", "banket"],
  ["grains", "graan", "koren", "koren*", "tarwe", "meel", "molen"],
  ["coffee", "koffie", "koffie*", "coffee", "cafe", "café", "espresso", "espressobar", "barista", "lunchroom"],
  ["tea-bag", "thee", "theehuis", "tea"],
  ["pizza", "pizza+", "pizza's", "pizzeria"],
  ["hamburger", "burger+", "snackbar", "friet", "frietzaak", "cafetaria", "fastfood"],
  ["fork-knife", "restaurant+", "eetcafé", "eetcafe", "food", "keuken+", "kitchen", "diner", "bistro", "brasserie", "catering", "horeca"],
  ["chef-hat", "kok", "koks", "chef", "chefs"],
  ["bowl-food", "poke", "pokebowl", "salade+", "saladebar", "noodle+", "wok"],
  ["ice-cream", "ijsje+", "ijssalon", "gelato"],
  ["wine", "wijn+", "wijnen", "wijnhandel", "wijnbar", "wine+", "vino", "sommelier"],
  ["beer-stein", "bier+", "bieren", "brouwerij", "brewery", "brewing", "pub", "kroeg", "taproom"],
  ["martini", "cocktail+", "cocktailbar", "lounge"],
  ["carrot", "groente+", "groenten", "groenteboer", "groentewinkel"],
  ["cherries", "fruit", "fruithandel"],
  ["scissors", "kapper+", "kappers*", "kapsalon+", "kapsalons", "barber+", "barbershop", "barbier+", "barbiers*", "hairstylist", "haarstudio", "haarsalon", "coiffeur", "kleermaker+", "kleermakerij", "tailor+"],
  ["hair-dryer", "schoonheidssalon", "beautysalon", "beauty", "styling"],
  ["hand-heart", "zorg", "thuiszorg", "zorggroep", "zorgbureau", "mantelzorg", "care", "verzorging"],
  ["heartbeat", "hart", "heart", "cardio", "gezondheid", "health", "vitaal", "vitality"],
  ["stethoscope", "arts", "artsen", "dokter+", "doctor+", "huisarts*", "huisartsen*", "medisch", "medical", "kliniek", "clinic"],
  ["tooth", "tandarts*", "tandartsen*", "tandtechniek", "dental", "mondzorg"],
  ["eye", "oog", "ogen", "eye+", "optiek", "optician", "opticien", "vision"],
  ["eyeglasses", "bril", "brillen", "brillen*", "glasses"],
  ["brain", "brein", "brain+", "mind", "psycholoog", "psychologie", "coach+", "coaching", "coaches"],
  ["baby", "baby", "baby's", "kinderopvang", "kinderdagverblijf", "peuterspeelzaal", "kids"],
  ["t-shirt", "shirt+", "kleding", "kledingwinkel", "clothing", "apparel", "fashion", "textiel", "merch"],
  ["hoodie", "hoodie+", "streetwear", "urban", "sweater+"],
  ["sneaker-move", "sneaker+", "schoen+", "schoenen*", "shoe+", "kicks"],
  ["dress", "jurk+", "jurken", "dress+", "bruidsmode", "bridal", "boutique"],
  ["coat-hanger", "stomerij", "wasserij", "garderobe"],
  ["baseball-cap", "pet", "petten", "cap", "caps"],
  ["handbag", "tas", "tassen", "tassen*", "bag+", "lederwaren", "leather"],
  ["shopping-bag", "winkel+", "shop", "shops", "store", "boetiek", "retail", "webshop", "webwinkel"],
  ["storefront", "markt", "kiosk", "supermarkt", "buurtwinkel", "buurtsuper"],
  ["gift", "cadeau+", "cadeaus", "cadeauwinkel", "gift+", "kado", "kadoshop"],
  ["watch", "horloge+", "horloges", "watch", "watches", "klokken*", "uurwerk*"],
  ["key", "sleutel+", "sleutels", "sleutelservice", "slotenmaker+", "makelaar+", "makelaars*", "makelaardij", "vastgoed"],
  ["house-line", "huis", "huizen", "home", "house", "wonen", "woning+", "woningen", "dak", "daken", "dakdekker+", "dakdekkers*", "dakwerken", "roofing"],
  ["hammer", "hamer", "hammer", "klus", "klussen", "klus*", "timmerman", "timmerbedrijf", "handyman", "renovatie+", "verbouwing+", "verbouw"],
  ["buildings", "bouw", "bouw*", "*bouw", "aannemer+", "aannemers*", "construction", "kantoor", "kantoor*", "office+"],
  ["hard-hat", "bouwplaats", "uitvoering", "veiligheidskunde"],
  ["crane", "kraan", "kraanverhuur", "crane+", "hijswerk*"],
  ["wall", "metselaar+", "metselwerk*", "tegelzetter+", "tegelwerk*", "stukadoor+", "stukadoors*", "voegbedrijf"],
  ["wrench", "monteur+", "monteurs", "onderhoud", "onderhouds*", "service", "techniek", "technisch", "installatie*", "installateur+"],
  ["toolbox", "gereedschap", "tools"],
  ["paint-roller", "schilder+", "schilders*", "verf", "verfwinkel", "painting", "painter+", "behanger+"],
  ["paint-brush", "kunst", "kunstenaar", "art", "creatief", "creative", "design", "designer+", "ontwerp", "ontwerper+", "ontwerpstudio"],
  ["pen-nib", "tekstschrijver", "copywriter", "copywriting", "tekstbureau", "redactie", "kalligrafie"],
  ["ladder", "glazenwasser+", "glazenwassers*", "glazenwasserij"],
  ["broom", "schoonmaak", "schoonmaak*", "huishoudelijk", "huishoudhulp"],
  ["washing-machine", "wasserette", "laundry", "witgoed"],
  ["shower", "badkamer+", "badkamers*", "sanitair"],
  ["pipe", "riool", "riolering", "rioolservice", "ontstopping", "ontstoppings*"],
  ["plug", "elektricien+", "elektriciens*"],
  ["lightbulb", "lamp+", "lampen", "lampen*", "verlichting", "idee", "idea+", "ideeën"],
  ["solar-panel", "zonnepanelen", "zonnepaneel", "solar", "duurzaam", "sustainable"],
  ["recycle", "recycling", "kringloop", "kringloopwinkel", "tweedehands", "vintage", "circulair"],
  ["shovel", "grondwerk*", "grondverzet", "bestrating*", "stratenmaker+"],
  ["tractor", "tractor+", "trekker+", "agrarisch", "landbouw", "loonbedrijf", "loonwerk"],
  ["factory", "fabriek", "factory", "industrie", "industrial", "machinebouw"],
  ["package", "pakket+", "pakketten", "pakketdienst", "verzending", "shipping", "magazijn"],
  ["engine", "tuning", "performance", "racing", "motorsport"],
  ["flag-checkered", "karting", "kartbaan", "circuit", "speed"],
  ["camera", "foto", "foto's", "fotograaf", "fotografie", "fotostudio", "photo", "photography", "camera"],
  ["aperture", "studio", "media", "mediabureau"],
  ["video-camera", "video", "video*", "film", "films", "filmproductie", "cinema", "vlog"],
  ["music-notes", "muziek", "muziek*", "music", "sound", "beats", "dj", "koor", "audio"],
  ["guitar", "gitaar", "gitaarles", "guitar+"],
  ["piano-keys", "piano", "pianoles", "pianostemmer"],
  ["microphone-stage", "zang", "zangles", "zanger+", "podcast+", "radio", "comedy"],
  ["soccer-ball", "voetbal", "voetbal*", "soccer", "football", "fc"],
  ["basketball", "basketbal", "basketball", "hoops"],
  ["tennis-ball", "tennis", "tennis*", "padel"],
  ["volleyball", "volleybal", "volleyball"],
  ["golf", "golf", "golfbaan", "golfclub"],
  ["barbell", "fitness", "gym", "sport", "sports", "sportschool", "sportcentrum", "krachttraining", "crossfit", "workout", "bootcamp", "trainer+", "personal", "athletics"],
  ["person-simple-run", "hardlopen", "hardloop*", "running", "atletiek", "marathon"],
  ["person-simple-swim", "zwemmen", "zwembad", "zwemschool", "swim", "swimming", "duikschool"],
  ["person-simple-hike", "wandelen", "wandel*", "hike", "hiking", "trail", "trails"],
  ["person-simple-tai-chi", "pilates", "dans", "dansschool", "dansstudio", "dance", "ballet"],
  ["boxing-glove", "boksen", "boksschool", "boxing", "kickboksen", "mma", "vechtsport*"],
  ["trophy", "trofee", "trophy", "winnaar+", "winner+", "champion+", "kampioen+", "victory"],
  ["target", "doel", "target", "goal+", "focus"],
  ["game-controller", "game", "games", "gaming", "esports", "gamestore"],
  ["puzzle-piece", "puzzel+", "puzzle+"],
  ["code", "code", "software", "developer+", "development", "webdesign", "webdevelopment", "app", "apps", "digital", "digitaal", "tech", "ict"],
  ["cpu", "chip+", "hardware", "computer+", "computers*", "pc"],
  ["wifi-high", "wifi", "netwerk+", "netwerken", "network+", "internet", "online"],
  ["database", "data", "cloud", "hosting", "server+"],
  ["device-mobile", "telefoon+", "telefoons", "telefoonwinkel", "phone+", "mobiel", "mobile", "gsm", "smartphone+"],
  ["atom", "atoom", "atom", "science", "wetenschap", "lab"],
  ["flask", "chemie", "laboratorium", "research"],
  ["book-open", "boek+", "boeken", "boeken*", "boekhandel", "book+", "bibliotheek", "uitgeverij", "verhaal", "stories"],
  ["graduation-cap", "school", "opleiding+", "opleidingen", "opleidings*", "cursus", "cursussen", "academy", "academie", "bijles", "onderwijs", "education", "training", "trainingen"],
  ["pencil", "potlood", "pencil", "schets", "sketch"],
  ["briefcase", "zakelijk", "business", "advies", "advies*", "adviseur+", "consult", "consultancy", "consulting", "partners", "management"],
  ["handshake", "bemiddeling", "uitzendbureau", "werving", "recruitment", "hr"],
  ["chart-line-up", "groei", "growth", "marketing", "sales", "beleggen", "invest", "investments", "strategie"],
  ["calculator", "boekhouder+", "boekhouding", "boekhoudkantoor", "administratie+", "administratiekantoor", "accountant+", "accountancy", "belasting", "belastingadvies", "tax"],
  ["coins", "geld", "money", "finance", "financieel", "financiën", "kapitaal", "capital"],
  ["scales", "recht", "advocaat", "advocaten", "advocaten*", "law", "legal", "juridisch", "jurist+", "notaris", "notarissen"],
  ["megaphone", "reclame", "reclame*", "promotie", "campagne+", "communicatie"],
  ["newspaper", "nieuws", "news", "krant", "magazine"],
  ["users-three", "team", "community", "vereniging", "collectief", "collective"],
  ["bed", "bed", "bedden", "beddenwinkel", "hotel", "hostel", "matras", "matrassen"],
  ["couch", "meubel+", "meubels", "meubelen", "meubel*", "furniture", "interieur", "interieur*", "interior+", "sofa"],
  ["door", "deur+", "deuren", "deuren*", "kozijn+", "kozijnen", "kozijnen*"],
  ["lighthouse", "vuurtoren", "lighthouse", "baken"],
  ["castle-turret", "kasteel", "castle", "burcht", "toren", "tower"],
  ["bridge", "brug", "bridge"],
  ["balloon", "ballon+", "ballonnen", "feest", "feesten", "feestwinkel", "party", "event", "events", "evenementen", "evenementen*"],
  ["confetti", "confetti", "bruiloft+", "bruiloften", "wedding+"],
  ["ticket", "ticket+", "theater", "festival+", "concert+"],
  ["magic-wand", "magie", "magic", "goochelaar", "wonder"],
  ["infinity", "oneindig", "infinity", "infinite", "forever", "limit", "limitless"],
  ["yin-yang", "balans", "balance", "harmonie", "harmony"],
  ["hands-praying", "geloof", "faith", "kerk", "church", "hoop", "hope", "blessed"],
  ["fingerprint", "identiteit", "identity", "uniek", "unique"],
  ["needle", "naaiatelier", "naaien", "borduren", "borduurstudio", "tattoo", "tattoos", "tattooshop", "ink"],
  ["yarn", "wol", "wolwinkel", "breien", "haken", "garen"],
  ["sunglasses", "zonnebril", "zonnebrillen", "shades"],
  ["cactus", "cactus", "woestijn", "desert"],
];

/** Het standaardteken per soort bedrijf (lib/logo/regels.ts BRANCHES). */
export const BRANCHE_TEKENS: Record<string, readonly string[]> = {
  // een kledingmerk krijgt het teken van zijn sfeer (kroon, bliksem, ster), geen T-shirt
  kleding: [],
  bouw: ["hammer", "buildings", "hard-hat"],
  horeca: ["fork-knife", "coffee", "wine"],
  bakker: ["bread", "grains", "cake"],
  zorg: ["hand-heart", "heartbeat", "leaf"],
  schoonmaak: ["sparkle", "broom", "drop"],
  transport: ["truck", "package", "compass-rose"],
  winkel: ["storefront", "shopping-bag", "tag"],
  beauty: ["scissors", "flower-lotus", "sparkle"],
  techniek: ["gear-six", "cpu", "wrench"],
  advies: ["chart-line-up", "briefcase", "handshake"],
  anders: [],
};

/** Het standaardteken per sfeer, als de naam en de soort bedrijf niets opleveren. */
export const SFEER_TEKENS: Record<string, readonly string[]> = {
  streetwear: ["lightning", "crown", "star-four"],
  sport: ["lightning", "trophy", "flag-checkered"],
  luxe: ["sparkle", "crown", "feather"],
  gothic: ["crown", "sword", "skull"],
  techno: ["planet", "rocket-launch", "atom"],
  outdoor: ["mountains", "tree-evergreen", "compass-rose"],
  strak: ["hexagon", "circles-three", "cube"],
  speels: ["sparkle", "balloon", "sun"],
  klassiek: ["feather", "crown", "key"],
  stoer: ["shield-star", "hand-fist", "fire"],
};

/** Woorden die nooit een teken opleveren: grote plaatsen en streken (ook als bijvoeglijk naamwoord) en veelvoorkomende naamdelen. */
const STOP = new Set(
  (
    "amsterdam amsterdamse rotterdam rotterdamse utrecht utrechtse haag haagse eindhoven eindhovense groningen groningse groninger tilburg tilburgse almere breda nijmegen nijmeegse " +
    "enschede apeldoorn haarlem haarlemse arnhem arnhemse zaanstad zaandam amersfoort haarlemmermeer hertogenbosch bosch zoetermeer zwolle zwolse maastricht leiden leidse dordrecht ede " +
    "leeuwarden emmen venlo delft deventer helmond helmondse oss hilversum heerlen sittard geleen roosendaal purmerend schiedam spijkenisse alkmaar vlaardingen almelo hoorn gouda assen " +
    "bergen bergschenhoek barendrecht papendrecht sliedrecht zwijndrecht mijdrecht woerden veenendaal zeist nieuwegein kampen hardenberg hoogeveen drachten heerenveen sneek harderwijk " +
    "middelburg vlissingen goes terneuzen roermond weert veghel uden waalwijk oosterhout doetinchem zutphen tiel culemborg wageningen winterswijk hengelo oldenzaal borne rijssen " +
    "zuidbroek hoogezand sappemeer veendam winschoten stadskanaal delfzijl appingedam haren " +
    "gelderland gelderse brabant brabantse limburg limburgse friesland friese drenthe drentse overijssel overijsselse zeeland zeeuwse holland hollandse twente twentse veluwe betuwe achterhoek " +
    "nederland nederlandse dutch benelux belgie belgië belgische " +
    "jansen janssen jong vries berg bakker visser smit meijer boer mulder bos vos peters hendriks dekker brouwer koning koster vermeulen versteeg verhoeven verbeek " +
    "van den der ter ten de het een en"
  ).split(/\s+/),
);
/** Na deze woorden komt het deel van een achternaam: "van den Berg", "ter Horst". */
const NAAMVOOR = new Set(["van", "den", "der", "ter", "ten", "vd", "v/d"]);

const UITGANGEN = ["", "en", "s", "e", "n", "je", "jes", "er", "ers", "'s"];

const woordenVan = (tekst: string): string[] =>
  tekst
    .toLowerCase()
    .split(/[^a-z0-9\u{E0}-\u{17F}'/]+/u)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);

/** Past dit woord bij deze stam? Zie de uitleg bovenaan: heel woord, tenzij de stam een *, + of $ draagt. */
export function past(woord: string, stam: string): boolean {
  if (stam.startsWith("*")) return woord.length > stam.length - 1 && woord.endsWith(stam.slice(1));
  if (stam.endsWith("*")) return woord.startsWith(stam.slice(0, -1));
  if (stam.endsWith("+")) return UITGANGEN.some((u) => woord === stam.slice(0, -1) + u);
  if (stam.endsWith("$")) return woord === stam.slice(0, -1);
  return woord === stam;
}

/**
 * De tekens die bij de woorden van het bedrijf zelf passen (naam, slogan, "wat voor bedrijf"), in de volgorde van de
 * woorden, zonder dubbele. Plaatsnamen en het deel van een achternaam na "van", "den", "der", "ter" of "ten" doen niet mee.
 */
export function tekensUitTekst(...teksten: (string | undefined)[]): string[] {
  const uit: string[] = [];
  for (const tekst of teksten) {
    if (!tekst) continue;
    const woorden = woordenVan(tekst);
    woorden.forEach((woord, i) => {
      const vorige = woorden[i - 1];
      // "van den Berg": Berg is hier een naam, geen berg; "Bakker" in de stoplijst telt alleen als naam ná zo'n voorvoegsel
      const naamdeel = vorige !== undefined && NAAMVOOR.has(vorige);
      if (naamdeel || (STOP.has(woord) && !ALTIJD.has(woord))) return;
      for (const [teken, ...stammen] of TREFWOORDEN) {
        if (!uit.includes(teken) && stammen.some((s) => past(woord, s))) uit.push(teken);
      }
    });
  }
  return uit;
}

/** Woorden die ook een achternaam zijn, maar los in een bedrijfsnaam gewoon het vak betekenen ("Bakker Jan", "De Boer"). */
const ALTIJD = new Set(["bakker"]);

export interface TekenKeuze {
  /** drie tekens, beste eerst */
  tekens: string[];
  /** kwam het eerste teken uit de woorden van het bedrijf zelf (en niet uit de standaard)? */
  eigen: boolean;
  /** hoeveel van de drie uit de eigen woorden komen; de rest is de standaard van de soort bedrijf of de sfeer */
  eigenAantal: number;
}

/** De tekens voor een aanvraag: eerst wat bij de eigen woorden past, dan de soort bedrijf, dan de sfeer. */
export function kiesTekens(invoer: { naam: string; slogan?: string | undefined; brancheTekst?: string | undefined; branche: string; sfeer: string }): TekenKeuze {
  const eigen = tekensUitTekst(invoer.naam, invoer.slogan, invoer.brancheTekst);
  const alle = [...eigen, ...(BRANCHE_TEKENS[invoer.branche] ?? []), ...(SFEER_TEKENS[invoer.sfeer] ?? []), "star-four", "sparkle", "hexagon"];
  return { tekens: [...new Set(alle)].slice(0, 3), eigen: eigen.length > 0, eigenAantal: Math.min(3, eigen.length) };
}
