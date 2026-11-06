// Welk 3D-onderdeel (public/paskamer/3d) bij een kledingsoort uit de paskamer
// hoort, met de laag waarin het valt. Puur: de 3D-weergave en de tests delen dit.

import type { Silhouet, Slot, Soort } from "@/lib/shop/paskamer";

export type Accessoire = "helm" | "pet" | "bril" | "handschoenen" | "kniebeschermers";
export type Stuk3D = { deel: string; laag: number; ruimte: number; kleurbaar: boolean } | { extra: Accessoire } | null;

/** Lagen van binnen naar buiten; een hogere laag krijgt iets meer ruimte zodat de stof niet door de laag eronder prikt. */
const LAAG: Partial<Record<Slot, number>> = { onder: 0, top: 1, midden: 2, jas: 3, hesje: 4, voeten: 0 };

export function stuk3D(soort: Soort, slot: Slot, silhouet: Silhouet): Stuk3D {
  const dames = silhouet === "dames";
  const laag = LAAG[slot] ?? 1;
  const kleding = (deel: string, ruimte = 0): Stuk3D => ({ deel, laag, ruimte, kleurbaar: true });
  switch (soort) {
    case "tshirt":
      return kleding(dames ? "shirt-d" : "shirt-h");
    case "overhemd":
    case "blouse":
      return kleding(dames ? "blouse-d" : "overhemd-h");
    case "hoodie":
      return kleding("lang-h");
    case "overshirt":
    case "fleece":
      return kleding("lang-h", 0.35);
    case "softshell":
      return kleding("jas-h");
    case "bodywarmer":
      return kleding("bodywarmer", 0.15);
    case "hesje":
      return kleding("hesje", 0.7);
    case "chino":
    case "werkbroek":
    case "thermobroek":
      return kleding(dames ? "broek-d" : "broek-h");
    case "werkschoen":
      return { deel: "werkschoen", laag, ruimte: 0, kleurbaar: false };
    case "sneaker":
      return { deel: "sneaker-wit", laag, ruimte: 0, kleurbaar: false };
    case "antislip":
      return { deel: "schoen-zwart", laag, ruimte: 0, kleurbaar: false };
    case "handschoen":
    case "snijhandschoen":
      return { extra: "handschoenen" };
    case "pet":
      return { extra: "pet" };
    case "helm":
      return { extra: "helm" };
    case "bril":
      return { extra: "bril" };
    case "kniebeschermer":
      return { extra: "kniebeschermers" };
    default:
      // sokken zitten in de schoenen; riem en tas komen in een volgende ronde
      return null;
  }
}

/** Basiskleding als er niets gekozen is: de paspop staat nooit zonder kleren in beeld. */
export function basisKleding(silhouet: Silhouet): { deel: string; kleur: string; laag: number }[] {
  const dames = silhouet === "dames";
  return [
    { deel: dames ? "shirt-d" : "shirt-h", kleur: "#d8d5ce", laag: 1 },
    { deel: dames ? "broek-d" : "broek-h", kleur: "#3b4047", laag: 0 },
    { deel: "sneaker-wit", kleur: "#ffffff", laag: 0 },
  ];
}

/** Hoe ruim een stuk valt in de 3D-tekening: cm uit het maatadvies → factor op de afstand tot het lijf. */
export const ruimteFactor = (cm: number): number => Math.max(-0.45, Math.min(1.1, cm * 0.045));

export type HaarStijl = "kort" | "staart" | "bob" | "geen";
export const HAAR_DEEL: Record<Exclude<HaarStijl, "geen">, string> = { kort: "haar-kort", staart: "haar-staart", bob: "haar-bob" };
export const HAARKLEUREN = ["#1b1612", "#3b2a1f", "#6b4a2f", "#a97c50", "#d8b679", "#8e3b1f", "#9a9a98"] as const;

/** Welke huidtextuur het dichtst bij een huidkleur ligt (licht, midden, donker), per silhouet. */
export function huidTextuur(huid: string, silhouet: Silhouet): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(huid);
  const n = m ? parseInt(m[1] ?? "000000", 16) : 0xd9a989;
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  const toon = l > 175 ? "licht" : l > 120 ? "midden" : "donker";
  return `${toon}-${silhouet === "heren" ? "h" : "d"}`;
}
