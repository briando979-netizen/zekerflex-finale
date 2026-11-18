import { CATEGORIE_EN, isShopCategorie } from "@/lib/shop/categorieen";
import { categoriePad } from "@/lib/shop/categoriemenu";
import { seizoenVan, type EtalageProduct, type Seizoen } from "@/lib/shop/etalage";
import { typischEerst } from "@/lib/shop/subgroepen";

// ---------------------------------------------------------------------------
// De banners boven aan de shop (18 nov 2026, eigenaar: banners zoals een grote webwinkel, ook voor Sinterklaas). In onze
// reclamestijl (donker, grote kop, mint) en met foto's van onze eigen producten. Eerlijk: de shop kent geen "van"-prijs
// en geen prijshistorie, dus er is geen banner met een korting, deal of aftelklok (Black Friday, topdeals): een
// kortingsbelofte mag alleen met de laagste prijs van de laatste 30 dagen erbij. Wel: een seizoensbanner in de weken
// van Sinterklaas en kerst, en banners voor de grootste categorieën. Een banner zonder genoeg producten met foto
// verschijnt niet. Puur bestand; het blok staat in components/marketing/ShopEtalage.tsx.
// ---------------------------------------------------------------------------

export interface Tekst {
  nl: string;
  en: string;
}

export interface ShopBanner {
  sleutel: string;
  soort: "seizoen" | "categorie";
  /** de grote kop: een witte regel en een regel in mint */
  kop: Tekst;
  accent: Tekst;
  fotos: string[];
  aantal: number;
  href: string;
}

const tk = (nl: string, en: string): Tekst => ({ nl, en });

/** Bij welk feest welke categorieën horen; de eerste die producten heeft, krijgt de link. */
const SEIZOEN: Record<Seizoen, { kop: Tekst; accent: Tekst; cats: readonly string[] }> = {
  sint: { kop: tk("Sinterklaas", "Sinterklaas"), accent: tk("Cadeaus voor pakjesavond.", "Gifts for 5 December."), cats: ["Speelgoed", "Cadeaus", "Baby & kind", "Gaming & hobby"] },
  kerst: { kop: tk("Kerst", "Christmas"), accent: tk("Cadeaus voor onder de boom.", "Gifts for under the tree."), cats: ["Feest & seizoen", "Cadeaus", "Speelgoed", "Wonen & keuken"] },
};

/** De regel in mint per categorie; een categorie zonder eigen regel krijgt de algemene. */
const ACCENT: Record<string, Tekst> = {
  "Werk & PBM": tk("Klaar voor je dienst.", "Ready for your shift."),
  Kleding: tk("Voor werk en weekend.", "For work and weekend."),
  Werkdag: tk("Alles voor onderweg.", "Everything for on the go."),
  Cadeaus: tk("Iets leuks om te geven.", "Something nice to give."),
  Elektronica: tk("Slim en handig.", "Smart and handy."),
  Speelgoed: tk("Voor binnen en buiten.", "For indoors and out."),
  "Wonen & keuken": tk("Maak het thuis af.", "Finish your home."),
  "Sport & buiten": tk("Erop uit.", "Get outside."),
  "Tuin & klussen": tk("Zelf aan de slag.", "Do it yourself."),
  "Tassen & schoenen": tk("Klaar om te gaan.", "Ready to go."),
};
const ALGEMEEN = tk("Bekijk het aanbod.", "See the range.");

const MIN_FOTOS = 3;

/** Hooguit `max` banners: eerst het seizoen (als het zover is), dan de grootste categorieën. Elke foto één keer. */
export function shopBanners(producten: readonly EtalageProduct[], nu: Date, max = 3): ShopBanner[] {
  const gebruikt = new Set<string>();
  const fotos = (groep: readonly EtalageProduct[]): string[] => {
    const uit: string[] = [];
    // eerst wat op voorraad is
    for (const p of [...groep.filter((x) => x.opVoorraad), ...groep.filter((x) => !x.opVoorraad)]) {
      if (uit.length >= MIN_FOTOS) break;
      if (p.imageUrl && !gebruikt.has(p.imageUrl) && !uit.includes(p.imageUrl)) uit.push(p.imageUrl);
    }
    return uit;
  };
  const uit: ShopBanner[] = [];
  const bezet = new Set<string>();

  const seizoen = seizoenVan(nu);
  if (seizoen) {
    const s = SEIZOEN[seizoen];
    // per categorie van het feest de producten die er duidelijk bij horen eerst
    const groep = s.cats.flatMap((c) => typischEerst(producten, c));
    const eerste = s.cats.find((c) => producten.some((p) => p.category === c));
    const f = fotos(groep);
    if (eerste && f.length >= MIN_FOTOS) {
      for (const x of f) gebruikt.add(x);
      // de link gaat naar één categorie: het aantal is dat van die categorie, zodat het klopt met wat je daarna ziet
      uit.push({ sleutel: seizoen, soort: "seizoen", kop: s.kop, accent: s.accent, fotos: f, aantal: producten.filter((p) => p.category === eerste).length, href: categoriePad(eerste) });
      bezet.add(eerste);
    }
  }

  const perCat = new Map<string, EtalageProduct[]>();
  for (const p of producten) perCat.set(p.category, [...(perCat.get(p.category) ?? []), p]);
  const groot = [...perCat].filter(([c]) => !bezet.has(c)).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "nl"));
  for (const [cat, groep] of groot) {
    if (uit.length >= max) break;
    const f = fotos(typischEerst(groep, cat));
    if (f.length < MIN_FOTOS) continue;
    for (const x of f) gebruikt.add(x);
    const kop = tk(cat.replace(" & ", " en "), (isShopCategorie(cat) ? CATEGORIE_EN[cat] : cat).replace(" & ", " and "));
    uit.push({ sleutel: `cat-${cat}`, soort: "categorie", kop, accent: Object.hasOwn(ACCENT, cat) ? (ACCENT[cat] ?? ALGEMEEN) : ALGEMEEN, fotos: f, aantal: groep.length, href: categoriePad(cat) });
  }
  return uit;
}
