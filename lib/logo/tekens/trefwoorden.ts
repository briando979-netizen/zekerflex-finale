// ---------------------------------------------------------------------------
// Welk teken past bij een bedrijf? Een koppeling van woorden (Nederlands en
// gangbaar Engels) uit de bedrijfsnaam, de slogan en "wat voor bedrijf" naar de
// namen van tekens in lib/logo/tekens/phosphor-fill.json, met een standaard per
// soort bedrijf en per sfeer. Puur: alleen namen, geen tekengegevens (die blijven
// op de server). tests/logo-tekens.test.ts controleert dat elke naam bestaat.
//
// Een woord telt als het met de stam begint (zie `past`): zo vindt "fietsenmaker"
// de fiets en "schildersbedrijf" de verfroller.
// ---------------------------------------------------------------------------

export const TREFWOORDEN: readonly (readonly [teken: string, ...stammen: string[]])[] = [
  ["bicycle", "fiets", "bike", "cycl", "wieler", "rijwiel"],
  ["motorcycle", "motor", "moto", "biker"],
  ["scooter", "scooter", "brommer"],
  ["car-profile", "auto", "car", "garage", "occasion", "apk", "rijschool", "rijles"],
  ["steering-wheel", "stuur", "chauffeur", "rijden", "drive"],
  ["tire", "wiel", "tyre", "tire"],
  ["truck", "transport", "vracht", "truck", "logistiek", "koerier", "verhuis", "bezorg"],
  ["van", "bestelbus", "busje", "bus"],
  ["taxi", "taxi"],
  ["airplane-tilt", "vlieg", "reis", "travel", "fly", "vakantie", "air"],
  ["sailboat", "zeil", "sail", "jacht", "boot", "boat", "haven", "watersport"],
  ["anchor", "anker", "anchor", "marine", "maritiem", "scheep"],
  ["rocket-launch", "raket", "rocket", "launch", "space", "ruimte"],
  ["planet", "planeet", "planet", "orbit", "galaxy", "cosmos", "kosmos"],
  ["globe-hemisphere-west", "wereld", "world", "globe", "global", "inter"],
  ["compass-rose", "kompas", "compass", "noord", "north", "koers"],
  ["map-pin", "locatie", "plek", "regio", "lokaal", "local"],
  ["mountains", "berg", "mount", "alp", "peak", "summit", "top", "kaap", "rots", "rock"],
  ["tent", "tent", "camp", "outdoor", "buiten"],
  ["campfire", "kampvuur", "bbq", "barbecue", "grill"],
  ["tree-evergreen", "bos", "woud", "forest", "den", "spar", "pine"],
  ["tree", "boom", "tree", "hout", "wood", "timmer"],
  ["tree-palm", "palm", "strand", "beach", "tropic", "tropisch"],
  ["leaf", "blad", "leaf", "groen", "green", "eco", "bio", "natuur", "nature", "vegan"],
  ["plant", "plant", "tuin", "garden", "hovenier", "kweker", "kwekerij"],
  ["flower-tulip", "tulp", "bloem", "flower", "bloemist", "florist", "boeket"],
  ["flower-lotus", "lotus", "yoga", "zen", "spa", "wellness", "massage", "mindful"],
  ["sun", "zon", "sun", "zomer", "summer", "solar"],
  ["moon-stars", "maan", "moon", "nacht", "night", "luna", "slaap"],
  ["star-four", "ster", "star", "nova", "stella", "astro"],
  ["sparkle", "glans", "shine", "sparkle", "glow", "poets", "schoon", "clean"],
  ["lightning", "bliksem", "flits", "flash", "bolt", "thunder", "donder", "volt", "energie", "energy", "power", "elektr", "electr"],
  ["fire", "vuur", "fire", "vlam", "flame", "heet", "hot", "blaze", "haard", "kachel"],
  ["drop", "water", "druppel", "drop", "aqua", "loodgiet", "plumb"],
  ["waves", "golven", "wave", "zee", "sea", "ocean", "oceaan", "surf", "kust"],
  ["snowflake", "sneeuw", "snow", "ijs", "ice", "winter", "koel", "cool", "frost", "airco", "klimaat"],
  ["wind", "wind", "lucht", "breeze", "storm"],
  ["crown", "kroon", "crown", "king", "koning", "queen", "royal", "royale", "konink", "prins", "prince", "majest", "imperial", "regal"],
  ["diamond", "diamant", "diamond", "juwel", "jewel", "sieraad", "goud", "gold", "luxe", "luxury", "brill"],
  ["sword", "zwaard", "sword", "ridder", "knight", "warrior", "strijd"],
  ["shield-star", "schild$", "shield", "guard", "bewak", "beveilig", "security", "secure", "veilig", "safe"],
  ["skull", "skull", "schedel", "dood", "death", "rebel", "pirate", "piraat"],
  ["ghost", "ghost", "spook", "geest"],
  ["alien", "alien", "ufo"],
  ["robot", "robot", "bot", "ai"],
  ["butterfly", "vlinder", "butterfly"],
  ["bird", "vogel", "bird", "adelaar", "eagle", "valk", "falcon", "arend", "duif", "zwaluw", "phoenix", "feniks", "raaf", "raven"],
  ["feather", "veer", "feather", "pluim"],
  ["paw-print", "poot", "paw", "dier", "animal", "wolf", "leeuw", "lion", "tijger", "tiger", "bear", "vos", "fox", "panter", "panther"],
  ["dog", "hond", "dog", "puppy", "trimsalon", "uitlaat"],
  ["cat", "kat", "poes", "cat", "kitten"],
  ["horse", "paard", "horse", "ruiter", "manege", "stal", "pony"],
  ["rabbit", "konijn", "rabbit", "haas", "bunny"],
  ["cow", "koe", "cow", "melk", "zuivel", "boer", "farm"],
  ["fish", "vis", "fish", "zalm", "haring", "sushi", "hengel"],
  ["bread", "brood", "bread", "bakker", "bakery", "bake"],
  ["cake", "taart", "cake", "gebak", "patisserie", "banket"],
  ["cookie", "koek", "cookie", "biscuit"],
  ["grains", "graan", "koren", "tarwe", "grain", "meel", "molen"],
  ["coffee", "koffie", "coffee", "cafe", "café", "espresso", "barista", "lunch"],
  ["tea-bag", "thee", "tea"],
  ["pizza", "pizza", "pizzeria", "italia"],
  ["hamburger", "burger", "snack", "friet", "cafetaria", "fastfood"],
  ["fork-knife", "restaurant", "eet", "food", "keuken", "kitchen", "diner", "bistro", "brasserie", "catering", "horeca", "maaltijd"],
  ["chef-hat", "kok", "chef", "cook"],
  ["cooking-pot", "pan", "soep", "stoof", "pot"],
  ["bowl-food", "bowl", "poke", "salade", "noodle", "wok", "ramen"],
  ["ice-cream", "ijsje", "ijssalon", "gelato", "icecream"],
  ["wine", "wijn", "wine", "vino", "sommelier"],
  ["beer-stein", "bier", "beer", "brouw", "brew", "pub", "kroeg", "taproom"],
  ["martini", "cocktail", "bar", "lounge", "club"],
  ["carrot", "groente", "wortel", "veggie", "vers", "fresh", "markt"],
  ["cherries", "fruit", "kers", "berry", "bes"],
  ["egg", "ei", "egg", "kip", "chicken"],
  ["scissors", "kapper", "kapsalon", "barber", "knip", "hair", "haar", "coiffeur", "kleermaker", "tailor"],
  ["hair-dryer", "fohn", "föhn", "salon", "beauty", "styling"],
  ["hand-heart", "zorg", "care", "hulp", "help", "thuiszorg", "verzorg", "mantel"],
  ["heartbeat", "hart", "heart", "cardio", "gezond", "health", "vitaal", "vital"],
  ["stethoscope", "arts", "dokter", "doctor", "huisarts", "praktijk", "medisch", "medical", "kliniek", "clinic"],
  ["tooth", "tand", "tooth", "dental", "mondzorg"],
  ["eye", "oog", "eye", "optiek", "optic", "vision", "visie", "lens"],
  ["eyeglasses", "bril", "glasses"],
  ["brain", "brein", "brain", "mind", "psych", "coach", "denk", "think", "smart", "slim"],
  ["baby", "baby", "kind", "kids", "kinder", "opvang", "peuter"],
  ["t-shirt", "shirt", "kleding", "cloth", "wear", "apparel", "mode", "fashion", "textiel", "merch"],
  ["hoodie", "hoodie", "street", "urban", "sweater"],
  ["sneaker-move", "sneaker", "schoen", "shoe", "kicks", "run"],
  ["dress", "jurk", "dress", "bruid", "bridal", "boutique"],
  ["coat-hanger", "hanger", "garderobe", "stomerij", "wasserij"],
  ["baseball-cap", "pet", "cap", "hat"],
  ["handbag", "tas", "bag", "leder", "leather"],
  ["shopping-bag", "winkel", "shop", "store", "boetiek", "retail"],
  ["storefront", "markt", "kiosk", "supermarkt", "buurtwinkel"],
  ["tag", "prijs", "outlet", "deal", "sale"],
  ["gift", "cadeau", "gift", "kado", "present"],
  ["watch", "horloge", "watch", "klok", "time", "tijd"],
  ["key", "sleutel", "key", "slot", "makelaar", "vastgoed", "estate", "woning"],
  ["house-line", "huis", "home", "house", "wonen", "woon", "thuis", "dak", "roof"],
  ["buildings", "bouw", "build", "aannem", "construct", "project", "vastgoed", "kantoor", "office"],
  ["hard-hat", "helm", "veiligheid", "uitvoer"],
  ["crane", "kraan", "crane", "hijs"],
  ["wall", "muur", "metsel", "steen", "tegel", "stuc", "brick", "voeg"],
  ["hammer", "hamer", "hammer", "klus", "timmerman", "handyman", "repar", "renov", "verbouw"],
  ["wrench", "monteur", "wrench", "onderhoud", "service", "techniek", "technisch", "install", "fietsenmaker"],
  ["screwdriver", "schroef", "montage", "assembl"],
  ["toolbox", "gereedschap", "tool"],
  ["paint-roller", "schilder", "verf", "paint", "kleur", "color", "colour", "behang"],
  ["paint-brush", "kwast", "kunst", "art", "creat", "design", "ontwerp"],
  ["palette", "palet", "palette", "teken", "illustr"],
  ["pen-nib", "pen", "schrijf", "write", "copy", "tekst", "redactie", "kalligraf"],
  ["ladder", "ladder", "glazenwas", "ramen", "window"],
  ["broom", "bezem", "veeg", "schoonmaak", "cleaning", "huishoud"],
  ["spray-bottle", "spray", "reinig", "desinfect", "polish"],
  ["washing-machine", "was", "laundry", "wasmachine"],
  ["shower", "douche", "badkamer", "bath", "sanitair"],
  ["pipe", "leiding", "riool", "afvoer", "pipe"],
  ["plug", "stekker", "plug", "stroom", "elektricien"],
  ["lightbulb", "lamp", "licht", "idee", "idea", "led", "verlichting"],
  ["solar-panel", "zonnepaneel", "solar", "duurzaam", "sustain"],
  ["recycle", "recycl", "herbruik", "circulair", "afval", "kringloop", "tweedehands", "vintage"],
  ["shovel", "schep", "graaf", "grond", "bestrat"],
  ["axe", "bijl", "axe", "hak", "kloof", "lumber"],
  ["tractor", "tractor", "trekker", "agrar", "landbouw", "loonbedrijf"],
  ["barn", "schuur", "barn", "boerderij", "hoeve"],
  ["factory", "fabriek", "factory", "industr", "productie", "machine"],
  ["package", "pakket", "pakje", "package", "doos", "box", "verzend", "shipping", "webshop", "magazijn"],
  ["gas-pump", "tank", "brandstof", "fuel", "pomp"],
  ["engine", "engine", "tuning", "performance", "racing", "race"],
  ["flag-checkered", "finish", "kart", "circuit", "speed", "snel", "fast"],
  ["camera", "foto", "photo", "camera", "fotograaf", "shoot", "beeld"],
  ["aperture", "lens", "studio", "focus", "media"],
  ["video-camera", "video", "film", "movie", "cinema", "vlog", "productions"],
  ["music-notes", "muziek", "music", "sound", "klank", "beat", "dj", "band", "koor", "audio"],
  ["guitar", "gitaar", "guitar", "rock"],
  ["piano-keys", "piano", "toets"],
  ["microphone-stage", "zang", "sing", "podcast", "mic", "stem", "voice", "radio", "comedy"],
  ["headphones", "koptelefoon", "headphone", "luister"],
  ["vinyl-record", "vinyl", "plaat", "record", "platen"],
  ["soccer-ball", "voetbal", "soccer", "football", "fc", "elftal"],
  ["basketball", "basket", "hoops"],
  ["tennis-ball", "tennis", "padel"],
  ["volleyball", "volley"],
  ["golf", "golf"],
  ["barbell", "fitness", "gym", "sport", "kracht", "strength", "train", "crossfit", "fit", "workout", "athlet"],
  ["person-simple-run", "hardloop", "running", "atletiek", "loop", "marathon"],
  ["person-simple-swim", "zwem", "swim", "duik"],
  ["person-simple-ski", "ski", "wintersport"],
  ["person-simple-hike", "wandel", "hike", "hiking", "trek", "trail"],
  ["person-simple-tai-chi", "pilates", "tai", "dans", "dance", "ballet"],
  ["boxing-glove", "boks", "box", "fight", "vecht", "mma", "kick"],
  ["hand-fist", "vuist", "fist", "strong", "sterk", "kracht"],
  ["trophy", "beker", "trophy", "winnaar", "winner", "champ", "kampioen", "victory", "winst"],
  ["medal", "medaille", "medal", "award", "prijs"],
  ["target", "doel", "target", "goal", "raak", "mik", "focus"],
  ["game-controller", "game", "gaming", "esport", "play", "speel"],
  ["dice-five", "dobbel", "dice", "spel", "bordspel"],
  ["puzzle-piece", "puzzel", "puzzle", "oploss", "solution"],
  ["code", "code", "software", "dev", "program", "web", "app", "digital", "digitaal", "tech", "ict"],
  ["cpu", "chip", "cpu", "hardware", "computer", "pc"],
  ["wifi-high", "wifi", "netwerk", "network", "internet", "online", "connect"],
  ["database", "data", "cloud", "hosting", "server"],
  ["device-mobile", "telefoon", "phone", "mobiel", "mobile", "gsm", "smartphone"],
  ["atom", "atoom", "atom", "science", "wetenschap", "lab", "nucle"],
  ["flask", "chemie", "chem", "labo", "onderzoek", "research", "formule"],
  ["dna", "dna", "gen", "biotech"],
  ["magnet", "magneet", "magnet", "aantrek"],
  ["book-open", "boek", "book", "lees", "read", "biblio", "uitgever", "verhaal", "story"],
  ["graduation-cap", "school", "opleiding", "cursus", "academy", "academie", "les", "bijles", "onderwijs", "educat", "leren", "learn", "training"],
  ["pencil", "potlood", "pencil", "schets", "sketch"],
  ["briefcase", "zaken", "business", "advies", "consult", "kantoor", "partners", "bureau", "management"],
  ["handshake", "samen", "partner", "deal", "bemiddel", "makelaardij", "uitzend", "werving", "recruit", "hr"],
  ["chart-line-up", "groei", "growth", "marketing", "sales", "omzet", "beleg", "invest", "strateg"],
  ["calculator", "boekhoud", "administr", "account", "belasting", "tax", "fiscal", "calcul"],
  ["coins", "geld", "money", "finan", "munt", "coin", "kapitaal", "capital"],
  ["scales", "recht", "advocaat", "law", "legal", "jurid", "notaris", "balans"],
  ["megaphone", "reclame", "promo", "campagne", "communicat", "pr", "ads"],
  ["newspaper", "nieuws", "news", "krant", "blad", "magazine", "pers"],
  ["envelope", "post", "mail", "brief"],
  ["users-three", "team", "groep", "group", "community", "club", "vereniging", "collectief", "collective"],
  ["bed", "bed", "slaap", "sleep", "hotel", "b&b", "logeer", "matras"],
  ["couch", "meubel", "furniture", "interieur", "interior", "wonen", "sofa"],
  ["armchair", "stoel", "fauteuil", "zit", "lounge"],
  ["door", "deur", "door", "kozijn", "entree"],
  ["lighthouse", "vuurtoren", "lighthouse", "baken", "gids", "guide"],
  ["castle-turret", "kasteel", "castle", "burcht", "toren", "tower", "fort"],
  ["bridge", "brug", "bridge", "verbind"],
  ["balloon", "ballon", "feest", "party", "event", "verjaardag"],
  ["confetti", "confetti", "viering", "celebr", "bruiloft", "wedding"],
  ["champagne", "champagne", "bubbels", "proost"],
  ["ticket", "ticket", "kaartje", "theater", "show", "festival", "concert"],
  ["mask-happy", "masker", "toneel", "drama", "carnaval"],
  ["magic-wand", "magie", "magic", "tover", "wonder", "goochel"],
  ["infinity", "oneindig", "infinity", "infinite", "forever", "eeuwig", "limit"],
  ["peace", "vrede", "peace", "hippie"],
  ["yin-yang", "balans", "balance", "harmon", "yin"],
  ["hands-praying", "geloof", "faith", "bid", "pray", "kerk", "church", "hoop", "hope", "zegen", "bless"],
  ["fingerprint", "identiteit", "identity", "uniek", "unique", "id"],
  ["detective", "detective", "recherche", "speur", "onderzoeksbureau"],
  ["siren", "alarm", "nood", "emergency", "112"],
  ["needle", "naald", "naai", "sew", "borduur", "tattoo", "ink"],
  ["yarn", "wol", "brei", "knit", "haak", "garen", "yarn"],
  ["sunglasses", "zonnebril", "shades", "cool"],
  ["hourglass", "zandloper", "geduld", "vintage", "antiek"],
  ["cactus", "cactus", "woestijn", "desert", "mexic"],
  ["acorn", "eikel", "eik", "oak", "noot"],
  ["bug", "kever", "insect", "ongedierte", "plaag", "pest"],
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
  luxe: ["diamond", "crown", "feather"],
  gothic: ["crown", "sword", "skull"],
  techno: ["planet", "rocket-launch", "atom"],
  outdoor: ["mountains", "tree-evergreen", "compass-rose"],
  strak: ["hexagon", "circles-three", "cube"],
  speels: ["sparkle", "balloon", "sun"],
  klassiek: ["feather", "crown", "key"],
  stoer: ["shield-star", "hand-fist", "fire"],
};

const woordenVan = (tekst: string): string[] =>
  tekst
    .toLowerCase()
    .split(/[^a-z0-9\u{E0}-\u{17F}&]+/u)
    .filter(Boolean);

/**
 * Past dit woord bij deze stam? Een stam van hooguit drie letters (of met een $ erachter) moet het hele woord zijn, zodat
 * "ei" niet bij "eigen" past en "schild" niet bij "schilder". Een langere stam past aan het begin van het woord, en vanaf
 * vijf letters ook ergens erin ("thuiszorg", "autogarage").
 */
function past(woord: string, stam: string): boolean {
  if (stam.endsWith("$")) return woord === stam.slice(0, -1);
  if (stam.length <= 3) return woord === stam;
  return woord.startsWith(stam) || (stam.length >= 5 && woord.includes(stam));
}

/** De tekens die bij de woorden van het bedrijf zelf passen (naam, slogan, "wat voor bedrijf"), beste eerst, zonder dubbele. */
export function tekensUitTekst(...teksten: (string | undefined)[]): string[] {
  const woorden = teksten.flatMap((t) => (t ? woordenVan(t) : []));
  const uit: string[] = [];
  for (const woord of woorden) {
    for (const [teken, ...stammen] of TREFWOORDEN) {
      if (!uit.includes(teken) && stammen.some((s) => past(woord, s))) uit.push(teken);
    }
  }
  return uit;
}

export interface TekenKeuze {
  /** drie tekens, beste eerst */
  tekens: string[];
  /** kwam het eerste teken uit de woorden van het bedrijf zelf (en niet uit de standaard)? */
  eigen: boolean;
}

/** De tekens voor een aanvraag: eerst wat bij de eigen woorden past, dan de soort bedrijf, dan de sfeer. */
export function kiesTekens(invoer: { naam: string; slogan?: string | undefined; brancheTekst?: string | undefined; branche: string; sfeer: string }): TekenKeuze {
  const eigen = tekensUitTekst(invoer.naam, invoer.slogan, invoer.brancheTekst);
  const alle = [...eigen, ...(BRANCHE_TEKENS[invoer.branche] ?? []), ...(SFEER_TEKENS[invoer.sfeer] ?? []), "star-four", "sparkle", "hexagon"];
  return { tekens: [...new Set(alle)].slice(0, 3), eigen: eigen.length > 0 };
}
