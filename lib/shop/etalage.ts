import { amsterdamParts } from "@/lib/time/amsterdam";
import { VOOR_WAARDEN, categoriePad, type VoorWaarde } from "@/lib/shop/categoriemenu";

// ---------------------------------------------------------------------------
// De voorpagina van de shop opgebouwd zoals bol.com (stap 6, 15 nov 2026, eigenaar: "zorg dat dezelfde inhoud op de
// webshop komt"): een blok Uitgelicht met een seizoenskaart en tegels, thema's, cadeauhulp, "Ontdek alles" en Snel regelen.
// Alleen met onze eigen, echte producten: een tegel, thema of keuze zonder producten verschijnt niet, en er zijn geen
// verzonnen deals, kortingen of adviesprijzen (die heeft de shop niet). Puur bestand; de blokken staan in
// components/marketing/ShopEtalage.tsx, de pagina in app/shop/page.tsx.
// ---------------------------------------------------------------------------

export interface EtalageProduct {
  id: string;
  slug?: string | undefined;
  name: string;
  category: string;
  gender?: string | null;
  collection?: string | null;
  imageUrl?: string | null;
  price: number;
  opVoorraad: boolean;
  /** loopt er nu een aanbieding op dit product? */
  deal?: boolean;
}

export const PRIJSKLASSEN = ["onder15", "15-30", "vanaf30"] as const;
export type Prijsklasse = (typeof PRIJSKLASSEN)[number];
const PRIJS_TABEL: Record<Prijsklasse, true> = { onder15: true, "15-30": true, vanaf30: true };

export function inPrijsklasse(prijs: number, k: Prijsklasse): boolean {
  if (k === "onder15") return prijs < 15;
  if (k === "15-30") return prijs >= 15 && prijs <= 30;
  return prijs > 30;
}

/** ?prijs=… uit het adres; Object.hasOwn, niet `in` ("constructor" telt niet). */
export function prijsUitAdres(v: unknown): Prijsklasse | null {
  return typeof v === "string" && Object.hasOwn(PRIJS_TABEL, v) ? (v as Prijsklasse) : null;
}

/** ?collectie=… uit het adres: alleen een collectie die echt bestaat. */
export function collectieUitAdres(v: unknown, bekend: readonly (string | null | undefined)[]): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const doel = v.trim().toLowerCase();
  return bekend.find((c): c is string => typeof c === "string" && c.toLowerCase() === doel) ?? null;
}

export const collectiePad = (c: string) => `/shop?collectie=${encodeURIComponent(c)}#collectie`;
export const prijsPad = (k: Prijsklasse) => `/shop?prijs=${k}#collectie`;
export const voorPad = (v: VoorWaarde) => `/shop?voor=${v}#collectie`;

/** De beste foto van een groep: op voorraad en met foto, en liefst nog niet gebruikt. */
function foto(groep: readonly EtalageProduct[], gebruikt: Set<string>): string | null {
  const metFoto = groep.filter((p) => p.imageUrl);
  const keuze = metFoto.find((p) => p.opVoorraad && !gebruikt.has(p.imageUrl as string)) ?? metFoto.find((p) => !gebruikt.has(p.imageUrl as string)) ?? metFoto[0];
  if (!keuze?.imageUrl) return null;
  gebruikt.add(keuze.imageUrl);
  return keuze.imageUrl;
}

export interface OntdekTegel {
  sleutel: string;
  soort: "collectie" | "catVoor" | "cat";
  cat?: string;
  voor?: VoorWaarde;
  collectie?: string;
  aantal: number;
  foto: string;
  href: string;
}

/** De tegels van Uitgelicht: collecties, dan categorie per doelgroep, dan categorieën; alleen met een foto, hooguit `max`. */
export function ontdekTegels(producten: readonly EtalageProduct[], max = 8): OntdekTegel[] {
  const gebruikt = new Set<string>();
  const uit: OntdekTegel[] = [];
  const voeg = (t: Omit<OntdekTegel, "foto">, groep: readonly EtalageProduct[]) => {
    if (uit.length >= max || groep.length < 2) return;
    const f = foto(groep, gebruikt);
    if (f) uit.push({ ...t, foto: f });
  };
  const collecties = [...new Set(producten.map((p) => p.collection).filter((c): c is string => Boolean(c)))];
  for (const c of collecties) {
    const groep = producten.filter((p) => p.collection === c);
    voeg({ sleutel: `col-${c}`, soort: "collectie", collectie: c, aantal: groep.length, href: collectiePad(c) }, groep);
  }
  const cats = [...new Set(producten.map((p) => p.category))];
  for (const cat of cats) {
    for (const v of VOOR_WAARDEN) {
      const groep = producten.filter((p) => p.category === cat && p.gender === v);
      voeg({ sleutel: `cat-${cat}-${v}`, soort: "catVoor", cat, voor: v, aantal: groep.length, href: categoriePad(cat, v) }, groep);
    }
  }
  for (const cat of cats) {
    const groep = producten.filter((p) => p.category === cat);
    voeg({ sleutel: `cat-${cat}`, soort: "cat", cat, aantal: groep.length, href: categoriePad(cat) }, groep);
  }
  return uit.length >= 4 ? uit : [];
}

export type Seizoen = "sint" | "kerst";

/** Sinterklaas van 1 november tot en met 5 december, kerst van 6 tot en met 26 december (Nederlandse kalender). */
export function seizoenVan(nu: Date): Seizoen | null {
  const { month, day } = amsterdamParts(nu);
  if (month === 11 || (month === 12 && day <= 5)) return "sint";
  if (month === 12 && day <= 26) return "kerst";
  return null;
}

export type ThemaSleutel = "seizoen" | "winter" | "werk" | "budget" | "team";

export interface Thema {
  sleutel: ThemaSleutel;
  aantal: number;
  fotos: string[];
  href: string;
  /** de collectie bij "winter" (voor de tekst) */
  collectie?: string;
}

/** De themakaarten; alleen thema's waar echt producten achter zitten. */
export function themaKaarten(producten: readonly EtalageProduct[], nu: Date): Thema[] {
  const gebruikt = new Set<string>();
  const fotos = (groep: readonly EtalageProduct[]) => {
    const uit: string[] = [];
    for (let i = 0; i < 3; i++) {
      const f = foto(groep, gebruikt);
      if (f && !uit.includes(f)) uit.push(f);
    }
    return uit;
  };
  const kaarten: Thema[] = [];
  const voeg = (t: Omit<Thema, "aantal" | "fotos">, groep: readonly EtalageProduct[]) => {
    if (groep.length) kaarten.push({ ...t, aantal: groep.length, fotos: fotos(groep) });
  };
  if (seizoenVan(nu)) voeg({ sleutel: "seizoen", href: categoriePad("Cadeaus") }, producten.filter((p) => p.category === "Cadeaus"));
  const winter = [...new Set(producten.map((p) => p.collection).filter((c): c is string => Boolean(c && /winter/i.test(c))))][0];
  if (winter) voeg({ sleutel: "winter", href: collectiePad(winter), collectie: winter }, producten.filter((p) => p.collection === winter));
  voeg({ sleutel: "werk", href: categoriePad("Werk & PBM") }, producten.filter((p) => p.category === "Werk & PBM"));
  voeg({ sleutel: "budget", href: prijsPad("onder15") }, producten.filter((p) => inPrijsklasse(p.price, "onder15")));
  voeg({ sleutel: "team", href: "/shop/zakelijk" }, producten.filter((p) => p.category === "Kleding"));
  return kaarten;
}

export type CadeauSleutel = VoorWaarde | "onder15" | "15-30" | "werk";

/** De snelle keuzes van de cadeauhulp, met het aantal producten; keuzes zonder producten vallen weg. */
export function cadeauKeuzes(producten: readonly EtalageProduct[]): { sleutel: CadeauSleutel; aantal: number; href: string }[] {
  const keuzes: { sleutel: CadeauSleutel; aantal: number; href: string }[] = [
    ...VOOR_WAARDEN.map((v) => ({ sleutel: v as CadeauSleutel, aantal: producten.filter((p) => p.gender === v).length, href: voorPad(v) })),
    { sleutel: "onder15", aantal: producten.filter((p) => inPrijsklasse(p.price, "onder15")).length, href: prijsPad("onder15") },
    { sleutel: "15-30", aantal: producten.filter((p) => inPrijsklasse(p.price, "15-30")).length, href: prijsPad("15-30") },
    { sleutel: "werk", aantal: producten.filter((p) => p.category === "Werk & PBM").length, href: categoriePad("Werk & PBM") },
  ];
  return keuzes.filter((k) => k.aantal > 0);
}

export interface OverzichtKolom {
  cat: string;
  aantal: number;
  href: string;
  links: { soort: "voor" | "collectie"; waarde: string; aantal: number; href: string }[];
}

/** "Ontdek alles bij ZekerFlex": per categorie het aantal, en de doelgroepen en collecties die er echt zijn. */
export function catalogusOverzicht(producten: readonly EtalageProduct[]): OverzichtKolom[] {
  const cats = [...new Set(producten.map((p) => p.category))];
  return cats.map((cat) => {
    const hier = producten.filter((p) => p.category === cat);
    const voor = VOOR_WAARDEN.map((v) => ({ soort: "voor" as const, waarde: v, aantal: hier.filter((p) => p.gender === v).length, href: categoriePad(cat, v) })).filter((l) => l.aantal > 0);
    const collecties = [...new Set(hier.map((p) => p.collection).filter((c): c is string => Boolean(c)))].map((c) => ({
      soort: "collectie" as const,
      waarde: c,
      aantal: hier.filter((p) => p.collection === c).length,
      href: collectiePad(c),
    }));
    return { cat, aantal: hier.length, href: categoriePad(cat), links: [...voor, ...collecties] };
  });
}
