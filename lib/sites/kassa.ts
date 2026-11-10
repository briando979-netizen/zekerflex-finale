import type { SiteProduct } from "@/lib/sites/types";
import { euro, maxBestelbaar } from "@/lib/sites/winkel";
import { amsterdamParts } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Webshop → Op locatie: de kassa voor verkopen in de eigen winkel (components/studio/Kassa.tsx).
// Puur bestand (ook in de browser en in tests): het mandje, het totaal, wisselgeld en de bon.
// Dezelfde producten en voorraad als de webshop; een regel zonder product is een los bedrag
// ("Cadeaubon", "Reparatie"). Opslaan als bestelling (kanaal "winkel") en de voorraad omlaag
// gebeuren op de server, via de bestellingen van de webshop.
// ---------------------------------------------------------------------------

export const KASSA_MAX_REGELS = 60;
export const KASSA_MAX_LOS_CENTS = 1_000_000; // € 10.000 per los bedrag

export type KassaMethode = "contant" | "pin";
export const KASSA_METHODEN: { id: KassaMethode; label: string; uitleg: string }[] = [
  { id: "contant", label: "Contant", uitleg: "Vul in wat de klant geeft; de kassa rekent het wisselgeld uit." },
  { id: "pin", label: "Pin", uitleg: "De klant pint op je eigen pinapparaat. Is de betaling gelukt, rond dan hier af." },
];

export interface KassaRegel {
  /** product + gekozen variant ("<id>|M, Zwart"); een los bedrag "los-<n>" */
  sleutel: string;
  /** null = los bedrag, zonder product en zonder voorraad */
  productId: string | null;
  naam: string;
  /** de gekozen opties: "M, Zwart" */
  variant?: string | undefined;
  prijsCents: number;
  aantal: number;
}

export type Mandje = KassaRegel[];

/** De gekozen opties van een product als tekst ("M, Zwart"), in de volgorde van de opties; null als er een ontbreekt. */
export function variantVan(product: Pick<SiteProduct, "opties">, keuzes: Record<string, string>): string | null {
  const opties = product.opties ?? [];
  if (opties.length === 0) return "";
  const gekozen: string[] = [];
  for (const o of opties) {
    const k = keuzes[o.naam];
    if (!k || !o.waarden.includes(k)) return null;
    gekozen.push(k);
  }
  return gekozen.join(", ");
}

/** Hoeveel van dit product (alle varianten samen) al in het mandje zit. */
export const inMandje = (mandje: Mandje, productId: string): number =>
  mandje.reduce((s, r) => s + (r.productId === productId ? r.aantal : 0), 0);

export type KassaUitslag = { mandje: Mandje } | { fout: string };

/** Eén stuk erbij. Houdt de bijgehouden voorraad aan (alle varianten samen), net als de webshop. */
export function voegToe(mandje: Mandje, product: SiteProduct, variant = ""): KassaUitslag {
  if (product.uitverkocht || (product.voorraad != null && product.voorraad <= 0)) return { fout: `${product.naam} is uitverkocht.` };
  if (inMandje(mandje, product.id) + 1 > maxBestelbaar(product)) {
    return { fout: product.voorraad != null ? `Van ${product.naam} ${product.voorraad === 1 ? "is er nog 1" : `zijn er nog ${product.voorraad}`}.` : `Meer dan ${maxBestelbaar(product)} tegelijk kan niet.` };
  }
  const sleutel = `${product.id}|${variant}`;
  const bestaand = mandje.find((r) => r.sleutel === sleutel);
  if (bestaand) return { mandje: mandje.map((r) => (r.sleutel === sleutel ? { ...r, aantal: r.aantal + 1 } : r)) };
  if (mandje.length >= KASSA_MAX_REGELS) return { fout: "Het mandje is vol. Reken eerst deze verkoop af." };
  return {
    mandje: [...mandje, { sleutel, productId: product.id, naam: product.naam, ...(variant ? { variant } : {}), prijsCents: product.prijsCents, aantal: 1 }],
  };
}

/** Een aantal zetten; 0 haalt de regel weg. Voor een product geldt de voorraad. */
export function zetAantal(mandje: Mandje, sleutel: string, aantal: number, producten: readonly SiteProduct[]): KassaUitslag {
  const regel = mandje.find((r) => r.sleutel === sleutel);
  if (!regel) return { mandje };
  const n = Math.max(0, Math.floor(aantal));
  if (n === 0) return { mandje: mandje.filter((r) => r.sleutel !== sleutel) };
  if (regel.productId) {
    const p = producten.find((x) => x.id === regel.productId);
    const anders = inMandje(mandje, regel.productId) - regel.aantal;
    const max = p ? maxBestelbaar(p) : 99;
    if (anders + n > max) return { fout: p?.voorraad != null ? `Van ${regel.naam} ${p.voorraad === 1 ? "is er nog 1" : `zijn er nog ${p.voorraad}`}.` : `Meer dan ${max} tegelijk kan niet.` };
  } else if (n > 99) {
    return { fout: "Meer dan 99 tegelijk kan niet." };
  }
  return { mandje: mandje.map((r) => (r.sleutel === sleutel ? { ...r, aantal: n } : r)) };
}

/** Een los bedrag erbij (zonder product): omschrijving en bedrag in centen. */
export function losBedrag(mandje: Mandje, omschrijving: string, cents: number): KassaUitslag {
  const naam = omschrijving.trim().slice(0, 80) || "Los bedrag";
  if (!Number.isInteger(cents) || cents <= 0) return { fout: "Vul een bedrag in." };
  if (cents > KASSA_MAX_LOS_CENTS) return { fout: `Een los bedrag kan hoogstens ${euro(KASSA_MAX_LOS_CENTS)} zijn.` };
  if (mandje.length >= KASSA_MAX_REGELS) return { fout: "Het mandje is vol. Reken eerst deze verkoop af." };
  const nr = mandje.filter((r) => r.productId === null).length + 1;
  return { mandje: [...mandje, { sleutel: `los-${nr}-${Date.now().toString(36)}`, productId: null, naam, prijsCents: cents, aantal: 1 }] };
}

export const mandjeTotaal = (mandje: Mandje): number => mandje.reduce((s, r) => s + r.prijsCents * r.aantal, 0);
export const aantalStuks = (mandje: Mandje): number => mandje.reduce((s, r) => s + r.aantal, 0);

/** Wisselgeld bij contant; null als de klant te weinig gaf. */
export const wisselgeld = (teBetalenCents: number, ontvangenCents: number): number | null =>
  ontvangenCents >= teBetalenCents ? ontvangenCents - teBetalenCents : null;

/** Snelknoppen voor wat de klant geeft: gepast, en de eerstvolgende ronde bedragen en briefjes erboven. */
export function snelBedragen(totaalCents: number): number[] {
  if (totaalCents <= 0) return [];
  const uit = new Set<number>([totaalCents]);
  for (const stap of [500, 1000, 2000, 5000, 10_000]) {
    const boven = Math.ceil(totaalCents / stap) * stap;
    if (boven > totaalCents) uit.add(boven);
  }
  return [...uit].sort((a, b) => a - b).slice(0, 5);
}

/* ─────────────── de bon ─────────────── */

export interface KassaBon {
  /** het bestelnummer (zoals bij de webshop) */
  nr: string;
  /** JJJJ-MM-DDTUU:MM:SSZ */
  op: string;
  winkel: { naam: string; adres?: string | undefined; telefoon?: string | undefined };
  regels: KassaRegel[];
  totaalCents: number;
  methode: KassaMethode;
  /** bij contant */
  ontvangenCents?: number | undefined;
  wisselgeldCents?: number | undefined;
}

/** Datum en tijd op de bon, in Nederlandse tijd (de server staat op UTC). */
export function bonTijd(iso: string): string {
  const p = amsterdamParts(new Date(iso));
  const t = (n: number) => String(n).padStart(2, "0");
  return `${t(p.day)}-${t(p.month)}-${p.year} ${t(p.hour)}:${t(p.minute)}`;
}

function knip(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Links tekst, rechts een bedrag, samen precies `kolommen` breed. */
export function tweeKolommen(links: string, rechts: string, kolommen: number): string {
  const ruimte = Math.max(1, kolommen - rechts.length - 1);
  const l = knip(links, ruimte);
  return `${l}${" ".repeat(Math.max(1, kolommen - l.length - rechts.length))}${rechts}`;
}

export interface BonOpmaak {
  kop: string[];
  regels: string[];
  voet: string[];
}

/** De bon als tekstregels voor een rol van `kolommen` tekens (58 mm = 32, 80 mm = 48); ook voor het scherm. */
export function bonOpmaak(bon: KassaBon, kolommen = 32): BonOpmaak {
  const kop = [bon.winkel.naam, bon.winkel.adres ?? "", bon.winkel.telefoon ?? ""].filter((s) => s.trim()).map((s) => knip(s, kolommen));
  const regels: string[] = [];
  regels.push(tweeKolommen(`Bon ${bon.nr}`, bonTijd(bon.op), kolommen));
  regels.push("-".repeat(kolommen));
  for (const r of bon.regels) {
    const naam = r.variant ? `${r.naam} (${r.variant})` : r.naam;
    if (r.aantal === 1) regels.push(tweeKolommen(naam, euro(r.prijsCents), kolommen));
    else {
      regels.push(knip(naam, kolommen));
      regels.push(tweeKolommen(`  ${r.aantal} x ${euro(r.prijsCents)}`, euro(r.prijsCents * r.aantal), kolommen));
    }
  }
  regels.push("-".repeat(kolommen));
  regels.push(tweeKolommen("Totaal", euro(bon.totaalCents), kolommen));
  if (bon.methode === "contant") {
    regels.push(tweeKolommen("Contant", euro(bon.ontvangenCents ?? bon.totaalCents), kolommen));
    regels.push(tweeKolommen("Wisselgeld", euro(bon.wisselgeldCents ?? 0), kolommen));
  } else {
    regels.push(tweeKolommen("Pin", euro(bon.totaalCents), kolommen));
  }
  return { kop, regels, voet: ["Bedankt en tot ziens!"] };
}
