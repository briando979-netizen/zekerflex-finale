// ---------------------------------------------------------------------------
// Van een geüploade foto een (verborgen) product maken, in Beheer → Webshop.
// Puur: de naam en de prijs kiest de eigenaar daarna zelf; het product gaat pas
// live als hij het zichtbaar zet. Een product zonder echte foto kan niet live.
// ---------------------------------------------------------------------------

export interface FotoVoorProduct {
  id: string;
  naam: string;
}

export interface ConceptProduct {
  name: string;
  slug: string;
  description: string;
  category: "Kleding";
  priceCents: number;
  stock: number;
  imageUrl: string;
  active: false;
}

const slugVan = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export function conceptProductVoorFoto(foto: FotoVoorProduct): ConceptProduct {
  const naam = foto.naam.trim().length >= 2 ? foto.naam.trim().slice(0, 120) : "Nieuw product";
  // het media-id erbij: twee foto's met dezelfde bestandsnaam botsen zo nooit
  const slug = `${slugVan(naam) || "product"}-${foto.id.slice(-6)}`.replace(/[^a-z0-9-]/g, "");
  return {
    name: naam,
    slug,
    description: "Nieuw product: pas de naam, omschrijving en prijs aan voordat je het zichtbaar zet.",
    category: "Kleding",
    priceCents: 0,
    stock: 0,
    imageUrl: `/beeld/${foto.id}`,
    active: false,
  };
}

/** Mag dit product zichtbaar worden? Alleen met een foto en een prijs. */
export function kanZichtbaarWorden(p: { imageUrl: string | null | undefined; priceCents: number }): string | null {
  if (!p.imageUrl) return "Zet eerst een echte foto bij het product voordat je het zichtbaar maakt.";
  if (p.priceCents <= 0) return "Vul eerst een prijs in voordat je het product zichtbaar maakt.";
  return null;
}
