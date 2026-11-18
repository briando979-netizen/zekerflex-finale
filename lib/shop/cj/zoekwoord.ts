// ---------------------------------------------------------------------------
// Zoeken bij CJ in het Nederlands (18 nov 2026). De catalogus van CJ is Engels; de
// eigenaar typt liever "speelgoed" of "tuinslang". Een vaste woordenlijst zet de bekende
// winkelwoorden om, woord voor woord; wat we niet kennen gaat letterlijk door (Engels
// blijft dus gewoon werken). Bewust geen taalmodel: dat is traag of weg tijdens een
// uitrol, en een zoekopdracht moet meteen antwoorden. Puur bestand.
// ---------------------------------------------------------------------------

/** Nederlands → Engels; "" = stopwoord dat weg mag ("de", "een", "goedkoop"). */
const WOORDEN: Readonly<Record<string, string>> = Object.freeze({
  // stopwoorden
  de: "", het: "", een: "", van: "", goedkoop: "", goedkope: "", nieuw: "", nieuwe: "", leuk: "", leuke: "", mooi: "", mooie: "", voor: "for", met: "with", en: "and", of: "or", zonder: "without",
  // speelgoed, baby en kind
  speelgoed: "toys", knuffel: "plush toy", knuffels: "plush toys", puzzel: "puzzle", puzzels: "puzzles", pop: "doll", poppen: "dolls", bouwstenen: "building blocks", bouwblokken: "building blocks", speelgoedauto: "toy car", bordspel: "board game", bordspellen: "board games", kinderen: "kids", kind: "kids", kinder: "kids", jongens: "boys", meisjes: "girls", peuter: "toddler", peuters: "toddler", baby: "baby", kinderwagen: "stroller", luiers: "diapers", speen: "pacifier", springkussen: "bouncy castle",
  // elektronica en telefoon
  oordopjes: "earbuds", oortjes: "earbuds", koptelefoon: "headphones", hoofdtelefoon: "headphones", telefoonhoesje: "phone case", hoesje: "phone case", hoesjes: "phone cases", telefoonhouder: "phone holder", telefoon: "phone", oplader: "charger", opladers: "chargers", oplaadkabel: "charging cable", kabel: "cable", kabels: "cables", powerbank: "power bank", luidspreker: "speaker", luidsprekers: "speakers", smartwatch: "smart watch", drone: "drone", drones: "drones", camera: "camera", microfoon: "microphone", tablet: "tablet", laptop: "laptop", laptoptas: "laptop bag", toetsenbord: "keyboard", muis: "mouse", stekker: "plug", batterij: "battery", batterijen: "batteries", zonnepaneel: "solar panel", elektronica: "electronics", gadget: "gadget", gadgets: "gadgets", draadloos: "wireless", draadloze: "wireless", elektrisch: "electric", elektrische: "electric", zaklamp: "flashlight",
  // gaming en hobby
  gamen: "gaming", gamestoel: "gaming chair", controller: "controller", hobby: "hobby", knutselen: "craft", knutsel: "craft", verf: "paint", tekenen: "drawing", stiften: "markers", breien: "knitting", haken: "crochet",
  // sieraden en horloges
  horloge: "watch", horloges: "watches", ketting: "necklace", kettingen: "necklaces", armband: "bracelet", armbanden: "bracelets", oorbellen: "earrings", sieraden: "jewelry", sieraad: "jewelry",
  // tassen en schoenen
  tas: "bag", tassen: "bags", rugzak: "backpack", rugzakken: "backpacks", handtas: "handbag", portemonnee: "wallet", schoenen: "shoes", schoen: "shoe", laarzen: "boots", slippers: "slippers", sandalen: "sandals", koffer: "suitcase", reizen: "travel", reis: "travel",
  // kleding
  kleding: "clothing", jas: "jacket", jassen: "jackets", trui: "sweater", truien: "sweaters", broek: "pants", broeken: "pants", jurk: "dress", jurken: "dresses", rok: "skirt", shirt: "shirt", shirts: "shirts", sokken: "socks", muts: "beanie", mutsen: "beanies", pet: "cap", sjaal: "scarf", handschoenen: "gloves", ondergoed: "underwear", badpak: "swimsuit", zwembroek: "swim shorts", mannen: "men", heren: "men", dames: "women", vrouwen: "women", winter: "winter", zomer: "summer", waterdicht: "waterproof", warm: "warm", regen: "rain", paraplu: "umbrella", zonnebril: "sunglasses", bril: "glasses", zonnehoed: "sun hat", mondkapje: "face mask",
  // werk en pbm
  werkkleding: "workwear", werkhandschoenen: "work gloves", veiligheidsschoenen: "safety shoes", werkschoenen: "work shoes", hesje: "safety vest", veiligheidshesje: "safety vest", helm: "helmet", gehoorbescherming: "ear protection", veiligheidsbril: "safety glasses", kniebeschermers: "knee pads",
  // wonen en keuken
  lamp: "lamp", lampen: "lamps", verlichting: "lighting", ledstrip: "led strip", kussen: "pillow", kussens: "pillows", deken: "blanket", dekens: "blankets", beddengoed: "bedding", handdoek: "towel", handdoeken: "towels", keuken: "kitchen", pan: "pan", pannen: "pans", mes: "knife", messen: "knives", beker: "mug", mok: "mug", mokken: "mugs", koffiemok: "coffee mug", fles: "bottle", drinkfles: "water bottle", thermosfles: "thermos", opbergdoos: "storage box", opbergen: "storage", opberger: "organizer", decoratie: "decor", kaars: "candle", kaarsen: "candles", plant: "plant", planten: "plants", bloemen: "flowers", stoel: "chair", stoelen: "chairs", bureaustoel: "office chair", bureau: "desk", tafel: "table", bank: "sofa", zitzak: "bean bag", bed: "bed", kast: "cabinet", boekenkast: "bookcase", spiegel: "mirror", klok: "clock", wekker: "alarm clock", gordijn: "curtain", gordijnen: "curtains", vloerkleed: "rug", lunchbox: "lunch box", broodtrommel: "lunch box", bestek: "cutlery", snijplank: "cutting board", schort: "apron", blender: "blender", koffie: "coffee", thee: "tea", weegschaal: "scale", keukenweegschaal: "kitchen scale", wonen: "home",
  // tuin en klussen
  tuin: "garden", tuinslang: "garden hose", gereedschap: "tools", boormachine: "drill", schroevendraaier: "screwdriver", ladder: "ladder", klussen: "diy", hamer: "hammer", zaag: "saw", lijmpistool: "glue gun", plantenbak: "planter", bbq: "barbecue", barbecue: "barbecue",
  // huisdieren
  hond: "dog", honden: "dog", kat: "cat", katten: "cat", huisdier: "pet", huisdieren: "pet", hondenriem: "dog leash", hondenmand: "dog bed", kattenbak: "litter box", aquarium: "aquarium", vogelkooi: "bird cage",
  // auto en fiets
  auto: "car", autos: "cars", "auto's": "cars", autohouder: "car phone holder", autolader: "car charger", fiets: "bike", fietsen: "bikes", fietslamp: "bike light", fietsslot: "bike lock", fietstas: "bike bag", scooter: "scooter", dashcam: "dash cam", banden: "tires",
  // sport en buiten
  sport: "sports", fitness: "fitness", yoga: "yoga", yogamat: "yoga mat", bal: "ball", ballen: "balls", voetbal: "football", kamperen: "camping", tent: "tent", slaapzak: "sleeping bag", wandelen: "hiking", zwemmen: "swimming", zwembril: "swim goggles", hardlopen: "running", vissen: "fishing",
  // beauty en gezondheid
  beauty: "beauty", "make-up": "makeup", makeup: "makeup", huidverzorging: "skin care", haar: "hair", haardroger: "hair dryer", stijltang: "hair straightener", nagels: "nails", nagellak: "nail polish", parfum: "perfume", scheerapparaat: "shaver", tondeuse: "hair trimmer", massage: "massage", massageapparaat: "massager", thermometer: "thermometer", gezondheid: "health", slaapmasker: "sleep mask", nekkussen: "neck pillow", bloeddrukmeter: "blood pressure monitor", kniebrace: "knee brace",
  // feest en seizoen
  kerst: "christmas", kerstmis: "christmas", kerstverlichting: "christmas lights", kerstboom: "christmas tree", kerstcadeau: "christmas gift", kerstversiering: "christmas decoration", sinterklaas: "gift", halloween: "halloween", pasen: "easter", paashaas: "easter bunny", verjaardag: "birthday", feest: "party", feestje: "party", ballonnen: "balloons", slingers: "garland", slinger: "garland", carnaval: "carnival", kostuum: "costume", verkleedkleding: "costume", valentijn: "valentine", oranje: "orange",
  // cadeaus en kantoor
  cadeau: "gift", cadeaus: "gifts", kado: "gift", kados: "gifts", cadeautje: "gift", cadeautjes: "gifts", relatiegeschenk: "corporate gift", relatiegeschenken: "corporate gifts", sleutelhanger: "keychain", sleutelhangers: "keychains", kantoor: "office", notitieboek: "notebook", pen: "pen", pennen: "pens",
  // kleuren en materialen
  zwart: "black", zwarte: "black", wit: "white", witte: "white", rood: "red", rode: "red", blauw: "blue", blauwe: "blue", groen: "green", groene: "green", roze: "pink", grijs: "grey", grijze: "grey", goud: "gold", gouden: "gold", zilver: "silver", zilveren: "silver", leer: "leather", leren: "leather", houten: "wooden", hout: "wood", katoen: "cotton", wol: "wool", opvouwbaar: "foldable", opvouwbare: "foldable", groot: "large", grote: "large", klein: "small", kleine: "small",
});

/** Een Nederlands zoekwoord → Engels voor de catalogus van CJ; `vertaald` zegt of er iets veranderde. */
export function naarEngelsZoekwoord(q: string): { q: string; vertaald: boolean } {
  const s = q.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return { q: "", vertaald: false };
  if (Object.hasOwn(WOORDEN, s)) {
    const heel = (WOORDEN[s] ?? "") || s;
    return { q: heel, vertaald: heel !== s };
  }
  const delen = s.split(" ").map((w) => {
    const k = w.replace(/[^a-z0-9'-]/g, "");
    return k && Object.hasOwn(WOORDEN, k) ? (WOORDEN[k] ?? w) : w;
  });
  const uit = delen.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return { q: uit || s, vertaald: uit !== s };
}
