// Het productformulier en de snelle lijst in Beheer -> Webshop (components/admin/ShopAdmin.tsx, ShopSnelCellen.tsx), in gewone woorden:
// prijzen in euro in plaats van centen, een webadres (slug) dat vanzelf uit de naam komt, en een snelle wijziging per rij. Puur bestand.

/** "12,95", "12.95", "€ 12", "1.234,50" -> centen; null als het geen geldig bedrag is (negatief, tekst, te groot, meer dan 2 decimalen). */
export function euroNaarCenten(tekst: string, max = 1_000_000): number | null {
  let t = tekst.replace(/[€\s]/g, "");
  if (!t) return null;
  // een punt als duizendtalscheiding ("1.234,50" of "1.234"), of als decimaalteken ("12.95")
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, "");
  t = t.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const centen = Math.round(Number(t) * 100);
  return Number.isFinite(centen) && centen >= 0 && centen <= max ? centen : null;
}

/** centen -> "12,95" (zonder euroteken, om in een veld te zetten). */
export function centenNaarEuro(centen: number | null | undefined): string {
  if (centen === null || centen === undefined || !Number.isFinite(centen)) return "";
  return (centen / 100).toFixed(2).replace(".", ",");
}

/** Een webadres uit de naam: kleine letters, zonder accenten, streepjes tussen woorden; leeg als er niets bruikbaars in zit. */
export function slugUitNaam(naam: string, max = 60): string {
  return naam
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Maakt het webadres uniek: bestaat het al, dan -2, -3, ... Zonder bruikbare naam: "product". */
export function uniekeSlug(basis: string, bestaand: Iterable<string>): string {
  const gebruikt = new Set(bestaand);
  const start = basis || "product";
  if (!gebruikt.has(start)) return start;
  for (let n = 2; n < 1000; n += 1) {
    const kandidaat = `${start.slice(0, 55)}-${n}`;
    if (!gebruikt.has(kandidaat)) return kandidaat;
  }
  return `${start.slice(0, 40)}-${Date.now().toString(36)}`;
}

/** Voorraad uit een tekstveld: een heel getal van 0 tot 1.000.000, anders null. */
export function voorraadNaarGetal(tekst: string): number | null {
  const t = tekst.trim();
  if (!/^\d{1,7}$/.test(t)) return null;
  const n = Number(t);
  return n <= 1_000_000 ? n : null;
}

export interface SnelProduct {
  priceCents: number;
  stock: number;
  active: boolean;
  variants: { id: string; stock: number }[];
}
export interface SnelConcept {
  prijsTekst: string;
  voorraadTekst: string;
  actief: boolean;
}
export interface SnelWijziging {
  /** wat naar PATCH /api/shop/products/:id gaat (alleen wat veranderd is) */
  product: { priceCents?: number; stock?: number; active?: boolean };
  /** bij precies één variant: de voorraad gaat naar die variant (daar kijkt de bestelling naar) */
  variant: { id: string; stock: number } | null;
  fouten: string[];
}

/** Voorraad die klanten zien: de som van de varianten, of die van het product zelf. */
export function effectieveVoorraad(p: Pick<SnelProduct, "stock" | "variants">): number {
  return p.variants.length > 0 ? p.variants.reduce((s, v) => s + v.stock, 0) : p.stock;
}

/** Kan de voorraad hier in de lijst? Bij meerdere varianten (maten, kleuren) niet: die staan per variant. */
export function voorraadInLijst(p: Pick<SnelProduct, "variants">): boolean {
  return p.variants.length <= 1;
}

/** Wat er opgeslagen moet worden voor deze rij: alleen de veranderde velden, met nette meldingen in gewoon Nederlands bij een ongeldige invoer. */
export function snelWijziging(p: SnelProduct, c: SnelConcept): SnelWijziging {
  const fouten: string[] = [];
  const product: SnelWijziging["product"] = {};
  let variant: SnelWijziging["variant"] = null;

  const centen = euroNaarCenten(c.prijsTekst);
  if (centen === null) fouten.push("Vul de prijs in euro in, bijvoorbeeld 12,95.");
  else if (centen !== p.priceCents) product.priceCents = centen;

  if (voorraadInLijst(p)) {
    const stock = voorraadNaarGetal(c.voorraadTekst);
    if (stock === null) fouten.push("Vul de voorraad in als een heel getal, bijvoorbeeld 25.");
    else if (stock !== effectieveVoorraad(p)) {
      if (p.variants.length === 1) variant = { id: p.variants[0]!.id, stock };
      else product.stock = stock;
    }
  }

  if (c.actief !== p.active) product.active = c.actief;
  return { product, variant, fouten };
}

/** Is er iets te bewaren? */
export function heeftWijziging(w: SnelWijziging): boolean {
  return Object.keys(w.product).length > 0 || w.variant !== null;
}