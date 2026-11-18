import { zoekScore, type ZoekProduct } from "@/lib/shop/zoeksuggesties";
import type { ShopCategorie } from "@/lib/shop/categorieen";

// ---------------------------------------------------------------------------
// De subgroepen in het grote categoriemenu (18 nov 2026, eigenaar: "dezelfde indeling" als een grote webwinkel): per
// categorie een korte lijst, elk een zoekopdracht binnen die categorie (/shop?cat=…&q=…). De shop zoekt in naam,
// categorie en omschrijving (lib/shop/zoeksuggesties.ts); hier tellen we met dezelfde functie, dus een subgroep staat
// alleen in het menu als de link echt iets laat zien, met het aantal dat de bezoeker daarna ook ziet.
// De catalogus is deels Engelstalig (leverancier): daarom per subgroep Nederlandse én Engelse zoekwoorden; het woord
// dat de meeste producten vindt, gaat in de link. Puur bestand, ook voor de browser.
// ---------------------------------------------------------------------------

export interface Subgroep {
  nl: string;
  en: string;
  /** zoekwoorden, bewust specifiek: de shop zoekt op een deel van een woord ("mat" vindt ook "automatic") */
  zoek: readonly string[];
}

const g = (nl: string, en: string, ...zoek: string[]): Subgroep => ({ nl, en, zoek });

export const SUBGROEPEN: Readonly<Record<ShopCategorie, readonly Subgroep[]>> = {
  "Werk & PBM": [
    g("Veiligheidsschoenen", "Safety shoes", "veiligheidsschoen", "werkschoen", "safety shoe"),
    g("Handschoenen", "Gloves", "handschoen", "gloves"),
    g("Helmen en brillen", "Helmets and goggles", "helm", "veiligheidsbril", "helmet", "goggles"),
    g("Werkkleding", "Workwear", "werkbroek", "werkjas", "workwear"),
    g("Gehoorbescherming", "Hearing protection", "gehoor", "earmuff"),
  ],
  Kleding: [
    g("Hoodies en truien", "Hoodies and sweaters", "hoodie", "trui", "sweater"),
    g("T-shirts", "T-shirts", "t-shirt", "shirt"),
    g("Jassen", "Jackets", "jassen", "jacket", "vest"),
    g("Broeken", "Trousers", "broek", "pants"),
    g("Sokken", "Socks", "sokken", "socks"),
  ],
  Werkdag: [
    g("Tassen", "Bags", "tote", "rugzak", "backpack"),
    g("Drinkflessen", "Bottles", "bottle", "drinkfles", "thermos"),
    g("Lunch", "Lunch", "lunchbox", "bento"),
  ],
  Cadeaus: [
    g("Cadeaupakketten", "Gift sets", "pakket", "cadeauset", "gift set"),
    g("Feest", "Party", "party", "feest"),
    g("Voor kinderen", "For kids", "kinderen", "children", "kids"),
  ],
  Elektronica: [
    g("Smartwatches", "Smartwatches", "smartwatch"),
    g("Gaming", "Gaming", "gaming"),
    g("Zaklampen", "Flashlights", "zaklamp", "flashlight"),
    g("Audio", "Audio", "bluetooth", "speaker", "headphone"),
    g("Stoelen", "Chairs", "stoel", "chair"),
  ],
  "Telefoon & accessoires": [
    g("Hoesjes", "Cases", "hoesje", "phone case"),
    g("Opladers", "Chargers", "oplader", "charger"),
    g("Kabels", "Cables", "kabel", "cable"),
    g("Houders", "Holders", "telefoonhouder", "phone holder"),
  ],
  "Gaming & hobby": [
    g("Gaming", "Gaming", "gaming"),
    g("Tekenen en knutselen", "Drawing and crafts", "markers", "tekenen", "knutsel"),
    g("Puzzels", "Puzzles", "puzzel", "puzzle"),
  ],
  Speelgoed: [
    g("Voertuigen", "Vehicles", "kids car", "speelgoedauto", "electric car"),
    g("Springkussens", "Bouncy castles", "bouncy", "springkussen"),
    g("Tekenen", "Drawing", "markers", "tekenen"),
    g("Bouwen", "Building", "building blocks", "bouwblokken", "blocks"),
    g("Spellen", "Games", "games", "spel"),
    g("Voor de kat", "For the cat", "veren", "feather"),
  ],
  "Baby & kind": [
    g("Babykleding", "Baby clothes", "romper", "baby"),
    g("Slapen", "Sleeping", "slaapzak", "sleeping"),
    g("Onderweg", "On the go", "kinderwagen", "stroller"),
  ],
  "Wonen & keuken": [
    g("Banken", "Sofas", "sofa", "bank"),
    g("Tafels", "Tables", "table", "tafel"),
    g("Opbergen", "Storage", "storage", "opberg", "organizer"),
    g("Keuken", "Kitchen", "kitchen", "keuken"),
    g("Kasten", "Cabinets", "cabinet", "kast"),
    g("Verlichting", "Lighting", "lichten", "lamp"),
    g("Schoonmaken", "Cleaning", "cleaning", "schoonmaak"),
    g("Feest en decoratie", "Party and decoration", "party", "decoratie"),
  ],
  "Tuin & klussen": [
    g("Gereedschap", "Tools", "tool", "gereedschap"),
    g("Badkamer", "Bathroom", "bathroom", "badkamer"),
    g("Tuin", "Garden", "garden", "tuin"),
    g("Decoratie", "Decoration", "decorations", "decoratie"),
  ],
  Huisdieren: [
    g("Honden", "Dogs", "hond", "dog"),
    g("Katten", "Cats", "katten", "cat toy"),
    g("Vogels", "Birds", "vogel", "bird"),
  ],
  "Sport & buiten": [
    g("Zaklampen", "Flashlights", "zaklamp", "flashlight"),
    g("Hoofdlampen", "Headlamps", "hoofdlamp", "koplamp", "headlamp"),
    g("Werklampen", "Work lights", "work light", "werklamp"),
    g("Fitness", "Fitness", "fitness"),
    g("Kamperen", "Camping", "camping", "tent"),
  ],
  "Auto & fiets": [
    g("Automatten", "Car mats", "floor mats", "automat"),
    g("Fiets", "Bike", "fiets", "bike"),
    g("Onderhoud", "Maintenance", "reparatie", "repair"),
  ],
  "Beauty & verzorging": [
    g("Make-up", "Make-up", "make-up", "makeup"),
    g("Huidverzorging", "Skin care", "huid", "skin"),
    g("Haar", "Hair", "haar", "hair"),
  ],
  Gezondheid: [
    g("Maskers", "Masks", "masker", "mask"),
    g("Massage", "Massage", "massage"),
    g("Ondersteuning", "Support", "brace", "bandage"),
  ],
  "Tassen & schoenen": [
    g("Handtassen", "Handbags", "handtas", "handbag"),
    g("Rugzakken", "Backpacks", "rugzak", "backpack"),
    g("Lunchboxen", "Lunch boxes", "lunchbox"),
    g("Schoenen", "Shoes", "schoenen", "shoes"),
  ],
  "Sieraden & horloges": [
    g("Horloges", "Watches", "horloge", "watch"),
    g("Kettingen", "Necklaces", "ketting", "necklace"),
    g("Armbanden", "Bracelets", "armband", "bracelet"),
    g("Ringen", "Rings", "ringen", "rings"),
  ],
  "Feest & seizoen": [
    g("Kerst", "Christmas", "kerst", "christmas"),
    g("Halloween", "Halloween", "halloween"),
    g("Verjaardag", "Birthday", "verjaardag", "birthday"),
    g("Versiering", "Decorations", "slinger", "garland"),
  ],
};

export interface SubgroepLink {
  nl: string;
  en: string;
  /** het zoekwoord in de link */
  zoek: string;
  aantal: number;
  href: string;
}

export const subgroepPad = (categorie: string, zoek: string) => `/shop?cat=${encodeURIComponent(categorie)}&q=${encodeURIComponent(zoek)}#collectie`;

/**
 * De subgroepen van een categorie die echt producten hebben, met het aantal. Een subgroep die precies dezelfde
 * producten toont als de hele categorie zegt niets en valt weg.
 */
export function subgroepenVoor(catalogus: readonly (ZoekProduct & { category?: string | null })[], categorie: string): SubgroepLink[] {
  if (!Object.hasOwn(SUBGROEPEN, categorie)) return [];
  const hier = catalogus.filter((p) => p.category === categorie);
  if (!hier.length) return [];
  const uit: SubgroepLink[] = [];
  for (const s of SUBGROEPEN[categorie as ShopCategorie]) {
    let beste = { zoek: "", aantal: 0 };
    for (const z of s.zoek) {
      const aantal = hier.filter((p) => zoekScore(p, z) > 0).length;
      if (aantal > beste.aantal) beste = { zoek: z, aantal };
    }
    if (beste.aantal > 0) uit.push({ nl: s.nl, en: s.en, zoek: beste.zoek, aantal: beste.aantal, href: subgroepPad(categorie, beste.zoek) });
  }
  return uit.filter((s) => s.aantal < hier.length);
}

/**
 * De producten van een categorie, met wat duidelijk bij de categorie hoort vooraan: producten die bij een van de
 * subgroepen passen. Voor het beeld bij een categorie en de banners (de catalogus van de leverancier is niet overal
 * netjes ingedeeld). De volgorde binnen beide groepen blijft die van de shop.
 */
export function typischEerst<T extends ZoekProduct & { category?: string | null }>(catalogus: readonly T[], categorie: string): T[] {
  const hier = catalogus.filter((p) => p.category === categorie);
  if (!Object.hasOwn(SUBGROEPEN, categorie)) return hier;
  const woorden = SUBGROEPEN[categorie as ShopCategorie].flatMap((s) => s.zoek);
  // alleen op de naam: de omschrijving van de leverancier noemt van alles
  const past = (p: T) => woorden.some((w) => zoekScore({ name: p.name }, w) > 0);
  return [...hier.filter(past), ...hier.filter((p) => !past(p))];
}
