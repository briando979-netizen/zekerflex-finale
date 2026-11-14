import { euroNaarCenten, slugUitNaam, uniekeSlug, voorraadNaarGetal } from "@/lib/shop/product-formulier";
import { kanZichtbaarWorden } from "@/lib/shop/media-product";

// Product toevoegen in drie stappen (Mijn winkel, deel 4): 1 foto of link, 2 naam, omschrijving en prijs, 3 voorraad en zichtbaar. Puur: de regels
// en de aanvragen aan de bestaande routes; het scherm (components/admin/ShopNieuwStappen.tsx) doet alleen het praten. Een nieuw product kan altijd eerst
// als concept (verborgen) worden bewaard; "Zet in de winkel" mag pas met een foto en een prijs, zoals in het gewone formulier.

export const CATEGORIEEN = ["Werk & PBM", "Kleding", "Werkdag", "Cadeaus"] as const;
export type Categorie = (typeof CATEGORIEEN)[number];

export interface NieuwVelden {
  /** de link naar het product bij de leverancier, en welke link echt gelezen is (die bewaren we bij het concept) */
  link: string;
  bronUrl: string;
  /** het adres van een foto van de leverancier (komt uit de link); de server neemt hem over bij het bewaren */
  fotoUrl: string;
  /** een zelf geuploade foto */
  imageUploadId: string | null;
  imageUrl: string | null;
  naam: string;
  omschrijving: string;
  categorie: Categorie;
  prijsTekst: string;
  voorraadTekst: string;
}

export const LEEG: NieuwVelden = { link: "", bronUrl: "", fotoUrl: "", imageUploadId: null, imageUrl: null, naam: "", omschrijving: "", categorie: "Werkdag", prijsTekst: "", voorraadTekst: "0" };

/** Heeft het product een foto (zelf geupload, of een adres van de leverancier dat de server overneemt)? */
export function heeftFoto(v: NieuwVelden): boolean {
  return Boolean(v.imageUrl) || v.fotoUrl.trim() !== "";
}

/** Een gelezen link: eerste regel van het idee is de titel, de rest de omschrijving (zoals lib/shop/link-product.ts ideeUitLink die samenstelt). */
export function vulUitLink(v: NieuwVelden, d: { idee: string; fotos: string[] }, link: string): NieuwVelden {
  const [eerste = "", ...rest] = d.idee.split(/\n\n/);
  return { ...v, bronUrl: link.trim(), fotoUrl: d.fotos[0] ?? "", imageUploadId: null, imageUrl: null, naam: v.naam || eerste.trim().slice(0, 120), omschrijving: v.omschrijving || rest.join("\n\n").trim().slice(0, 600) };
}

/** De meldingen in gewoon Nederlands bij het doorgaan naar de volgende stap; leeg = door. */
export function stapFouten(stap: 1 | 2 | 3, v: NieuwVelden): string[] {
  const f: string[] = [];
  if (stap >= 2) {
    if (v.naam.trim().length < 2) f.push("Geef het product een naam van minstens twee tekens.");
    if (v.omschrijving.trim().length < 10) f.push("Schrijf een korte omschrijving van minstens tien tekens, of laat de Winkel-AI er een maken.");
    if (v.omschrijving.trim().length > 600) f.push("De omschrijving is te lang: hooguit 600 tekens.");
    if (euroNaarCenten(v.prijsTekst) === null) f.push("Vul de verkoopprijs in euro in, bijvoorbeeld 12,95.");
  }
  if (stap >= 3 && !heeftLinkPad(v) && voorraadNaarGetal(v.voorraadTekst) === null) f.push("Vul de voorraad in als een heel getal, bijvoorbeeld 25.");
  return f;
}

/** Met een link (en dus een foto van de leverancier) maakt de Winkel-AI-route een concept met een eigen variant; de voorraad zet je dan in de lijst. */
export function heeftLinkPad(v: NieuwVelden): boolean {
  return v.fotoUrl.trim() !== "" && !v.imageUrl;
}

/** Mag het product direct in de winkel? Alleen met een foto en een prijs; een link-foto is pas na het bewaren overgenomen, dus daar eerst als concept. */
export function magInDeWinkel(v: NieuwVelden): string | null {
  const centen = euroNaarCenten(v.prijsTekst) ?? 0;
  if (heeftLinkPad(v)) return "De foto van de leverancier wordt bij het bewaren overgenomen. Bewaar het eerst als concept en zet het daarna in de lijst aan.";
  return kanZichtbaarWorden({ imageUrl: v.imageUrl, priceCents: centen });
}

/** De aanvraag voor POST /api/shop/products (een eigen foto of geen foto): webadres vanzelf, één variant door de server. */
export function productBody(v: NieuwVelden, bestaandeSlugs: string[], zichtbaar: boolean) {
  return {
    name: v.naam.trim(),
    slug: uniekeSlug(slugUitNaam(v.naam), bestaandeSlugs),
    description: v.omschrijving.trim(),
    category: v.categorie,
    gender: null,
    collection: null,
    isBundle: false,
    priceCents: euroNaarCenten(v.prijsTekst) ?? 0,
    costCents: null,
    stock: voorraadNaarGetal(v.voorraadTekst) ?? 0,
    ...(v.imageUploadId ? { imageUploadId: v.imageUploadId } : {}),
    ...(v.imageUrl ? { imageUrl: v.imageUrl } : {}),
    badge: null,
    active: zichtbaar,
    sortOrder: 0,
  };
}

/** De aanvraag voor POST /api/admin/shop-ai/opslaan (de link-route): altijd een concept, de server neemt de foto van het adres over. */
export function conceptBody(v: NieuwVelden) {
  return {
    concept: { name: v.naam.trim(), category: v.categorie, gender: null, collection: null, badge: null, description: v.omschrijving.trim(), sizes: [] as string[], colors: [] as string[], soort: null },
    inkoopCents: null,
    prijsCents: euroNaarCenten(v.prijsTekst) ?? 0,
    metFoto: false,
    ...(v.fotoUrl.trim() ? { fotoUrl: v.fotoUrl.trim() } : {}),
    ...(v.bronUrl.trim() ? { bronUrl: v.bronUrl.trim() } : {}),
  };
}