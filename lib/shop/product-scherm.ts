import { euroNaarCenten, voorraadNaarGetal } from "@/lib/shop/product-formulier";
import { SHOP_CATEGORIEEN } from "@/lib/shop/categorieen";

// ---------------------------------------------------------------------------
// Beheer → Webshop: één scherm om een product te plaatsen of te wijzigen (15 nov 2026, eigenaar: "het is moeilijk een product
// te plaatsen; ik moet ook meerdere foto's kunnen uploaden"). Foto's (meerdere, de eerste is de hoofdfoto), naam, prijs,
// omschrijving, categorie en maten/kleuren met voorraad in één keer; daarna één knop. Puur: het scherm zit in
// components/admin/ShopProductScherm.tsx, de varianten gaan in één keer via PUT /api/shop/products/:id/variants.
// ---------------------------------------------------------------------------

/** Zoveel foto's per product, de hoofdfoto meegeteld. */
export const MAX_FOTOS = 10;
/** Zoveel extra foto's naast de hoofdfoto (de kolom fotos). */
export const MAX_EXTRA_FOTOS = MAX_FOTOS - 1;
/** Zoveel maat-kleurcombinaties in één keer. */
export const MAX_VARIANTEN = 200;

export const CATEGORIEEN = SHOP_CATEGORIEEN;
export type Categorie = (typeof CATEGORIEEN)[number];

/** Snelkeuzes voor maten; je kunt er altijd zelf een bijtypen. */
export const MAAT_SETS: readonly { naam: string; maten: readonly string[] }[] = [
  { naam: "Kleding", maten: ["XS", "S", "M", "L", "XL", "XXL"] },
  { naam: "Schoenen", maten: ["38", "39", "40", "41", "42", "43", "44", "45", "46"] },
  { naam: "Kinderen", maten: ["98/104", "110/116", "122/128", "134/140", "146/152"] },
  { naam: "Broeken", maten: ["W28", "W30", "W32", "W34", "W36", "W38"] },
];

/** Veelgebruikte kleuren als snelkeuze. */
export const KLEUR_SNEL = ["Zwart", "Wit", "Grijs", "Marineblauw", "Lichtblauw", "Rood", "Groen", "Beige"] as const;

export interface VariantRij {
  size: string | null;
  color: string | null;
  stock: number;
}

const schoon = (v: string | null | undefined, max: number): string | null => {
  const t = (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return t ? t : null;
};
export const variantSleutel = (size: string | null | undefined, color: string | null | undefined) =>
  `${(schoon(size, 20) ?? "").toLowerCase()}|${(schoon(color, 40) ?? "").toLowerCase()}`;

/** Een lijst (maten of kleuren) zonder lege en dubbele, in de volgorde van invoeren. */
export function uniekeLijst(waarden: readonly string[], max: number): string[] {
  const gezien = new Set<string>();
  const uit: string[] = [];
  for (const w of waarden) {
    const t = schoon(w, max);
    if (!t || gezien.has(t.toLowerCase())) continue;
    gezien.add(t.toLowerCase());
    uit.push(t);
  }
  return uit;
}

/**
 * Alle combinaties van maten en kleuren, met de voorraad die er al was (bij wijzigen) of de standaardvoorraad. Zonder maten en
 * kleuren is er één rij zonder maat en kleur.
 */
export function variantRijen(maten: readonly string[], kleuren: readonly string[], bestaand: readonly VariantRij[], standaard: number): VariantRij[] {
  const m = uniekeLijst(maten, 20);
  const k = uniekeLijst(kleuren, 40);
  const oud = new Map(bestaand.map((v) => [variantSleutel(v.size, v.color), v.stock]));
  const rij = (size: string | null, color: string | null): VariantRij => ({ size, color, stock: oud.get(variantSleutel(size, color)) ?? standaard });
  if (!m.length && !k.length) return [rij(null, null)];
  if (!k.length) return m.map((size) => rij(size, null));
  if (!m.length) return k.map((color) => rij(null, color));
  return k.flatMap((color) => m.map((size) => rij(size, color)));
}

/** De maten en kleuren die een product al heeft (om het scherm bij wijzigen te vullen). */
export function matenEnKleuren(varianten: readonly { size: string | null; color: string | null }[]): { maten: string[]; kleuren: string[] } {
  return { maten: uniekeLijst(varianten.map((v) => v.size ?? ""), 20), kleuren: uniekeLijst(varianten.map((v) => v.color ?? ""), 40) };
}

/** De upload-id achter een eigen foto (/api/shop/media/<id>), of null voor een vaste foto of een link. */
export function uploadIdUit(url: string | null | undefined): string | null {
  const m = /^\/api\/shop\/media\/([A-Za-z0-9_-]{1,128})$/.exec(url ?? "");
  return m?.[1] ?? null;
}

/** De foto's in de volgorde van het scherm, verdeeld over het product: de eerste is de hoofdfoto, de rest extra. */
export function fotosNaarProduct(fotos: readonly string[]): { imageUrl: string | null; imageUploadId: string | null; fotos: string[] } {
  const lijst = [...new Set(fotos.map((f) => f.trim()).filter(Boolean))].slice(0, MAX_FOTOS);
  const hoofd = lijst[0] ?? null;
  return { imageUrl: hoofd, imageUploadId: uploadIdUit(hoofd), fotos: lijst.slice(1) };
}

/** De foto's van een bestaand product, in de volgorde van het scherm. */
export function fotosVanProduct(p: { imageUrl: string | null; fotos?: readonly string[] | null }): string[] {
  return [...new Set([p.imageUrl ?? "", ...(p.fotos ?? [])].filter(Boolean))];
}

/** Eén foto naar een andere plek (slepen of de pijltjes). */
export function verplaats<T>(lijst: readonly T[], van: number, naar: number): T[] {
  if (van === naar || van < 0 || van >= lijst.length) return [...lijst];
  const uit = [...lijst];
  const [x] = uit.splice(van, 1);
  uit.splice(Math.max(0, Math.min(uit.length, naar)), 0, x as T);
  return uit;
}

export interface SchermVelden {
  naam: string;
  omschrijving: string;
  prijsTekst: string;
  categorie: Categorie;
  fotos: string[];
  varianten: VariantRij[];
  zichtbaar: boolean;
}

/** Wat er nog ontbreekt, in gewoon Nederlands; leeg = bewaren kan. Zichtbaar in de shop vraagt ook een foto en voorraad. */
export function schermFouten(v: SchermVelden): string[] {
  const f: string[] = [];
  if (v.naam.trim().length < 2) f.push("Geef het product een naam van minstens twee tekens.");
  if (v.omschrijving.trim().length < 10) f.push("Schrijf een korte omschrijving van minstens tien tekens (of laat de Winkel-AI er een maken).");
  if (v.omschrijving.trim().length > 600) f.push("De omschrijving is te lang: hooguit 600 tekens.");
  const prijs = euroNaarCenten(v.prijsTekst);
  if (prijs === null || prijs <= 0) f.push("Vul de verkoopprijs in euro in, bijvoorbeeld 12,95.");
  if (!v.varianten.length) f.push("Kies minstens één maat of laat maten en kleuren leeg.");
  if (v.varianten.length > MAX_VARIANTEN) f.push(`Hooguit ${MAX_VARIANTEN} combinaties van maat en kleur.`);
  if (v.zichtbaar && !v.fotos.length) f.push("Een product in de shop heeft minstens één foto. Voeg een foto toe of bewaar het als concept.");
  if (v.zichtbaar && !v.varianten.some((r) => r.stock > 0)) f.push("Een product in de shop heeft voorraad nodig. Vul de voorraad in of bewaar het als concept.");
  return f;
}

/** De voorraad uit een veld: een heel getal 0..1.000.000, anders 0. */
export function voorraadUit(tekst: string): number {
  return voorraadNaarGetal(tekst) ?? 0;
}
