import type { SiteProduct, Winkel } from "@/lib/sites/types";
import { LEGE_INVOER, euro, isUitverkocht, maxBestelbaar, type BestelRegel, type Bestelconcept } from "@/lib/sites/winkel";
import { KOR_TEKST, btwInstellingVan, btwLabel, btwOverzicht, tariefVan, type BtwOverzicht } from "@/lib/sites/winkel-btw";
import { amsterdamDayKey, amsterdamParts } from "@/lib/time/amsterdam";

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
  /** de btw zoals de webshop hem rekent (lib/sites/winkel-btw.ts); leeg = de winkel heeft geen btw ingesteld */
  btw?: BtwOverzicht | undefined;
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
    const naam = r.variant && !r.naam.endsWith(`(${r.variant})`) ? `${r.naam} (${r.variant})` : r.naam;
    if (r.aantal === 1) regels.push(tweeKolommen(naam, euro(r.prijsCents), kolommen));
    else {
      regels.push(knip(naam, kolommen));
      regels.push(tweeKolommen(`  ${r.aantal} x ${euro(r.prijsCents)}`, euro(r.prijsCents * r.aantal), kolommen));
    }
  }
  regels.push("-".repeat(kolommen));
  // bij prijzen exclusief btw komt de btw vóór het totaal erbij; inclusief staat hij eronder ("waarvan")
  if (bon.btw && !bon.btw.kor && !bon.btw.inclusief) for (const b of bon.btw.regels) regels.push(tweeKolommen(btwLabel(b, false), euro(b.btwCents), kolommen));
  regels.push(tweeKolommen("Totaal", euro(bon.totaalCents), kolommen));
  if (bon.methode === "contant") {
    regels.push(tweeKolommen("Contant", euro(bon.ontvangenCents ?? bon.totaalCents), kolommen));
    regels.push(tweeKolommen("Wisselgeld", euro(bon.wisselgeldCents ?? 0), kolommen));
  } else {
    regels.push(tweeKolommen("Pin", euro(bon.totaalCents), kolommen));
  }
  if (bon.btw && !bon.btw.kor && bon.btw.inclusief && bon.btw.regels.length) {
    regels.push("");
    for (const b of bon.btw.regels) regels.push(tweeKolommen(btwLabel(b, true), euro(b.btwCents), kolommen));
  }
  const voet = bon.btw?.kor ? [...ombreek(KOR_TEKST, kolommen), "Bedankt en tot ziens!"] : ["Bedankt en tot ziens!"];
  return { kop, regels, voet };
}

/** Een zin over regels van hoogstens `kolommen` tekens, op spaties. */
function ombreek(zin: string, kolommen: number): string[] {
  const uit: string[] = [];
  let regel = "";
  for (const woord of zin.split(/\s+/)) {
    if (!regel) regel = woord;
    else if (regel.length + 1 + woord.length <= kolommen) regel += ` ${woord}`;
    else {
      uit.push(regel);
      regel = woord;
    }
  }
  if (regel) uit.push(regel);
  return uit.map((r) => knip(r, kolommen));
}

/* ─────────────── op de server: van mandje naar bestelling ─────────────── */

/** Wat de kassa naar de server stuurt: een product (met variant) of een los bedrag. Prijzen van producten komen nooit van de browser. */
export type KassaInvoerRegel = { productId: string; variant: string; aantal: number } | { los: string; prijsCents: number; aantal: number };

/** De naam van een verkoop in de winkel bij Bestellingen (er is geen klant met naam of adres). */
export const KASSA_KLANT = "Verkoop in de winkel";

/**
 * Een verkoop in de winkel als bestelling, met de prijzen, varianten, voorraad en btw van de winkel
 * zelf (zoals berekenBestelling in lib/sites/winkel.ts, maar zonder klant, verzending of korting, en
 * ook voor producten die niet online staan). Alle varianten van één product tellen samen voor de voorraad.
 */
export function kassaConcept(w: Winkel, invoer: readonly KassaInvoerRegel[]): { concept: Bestelconcept; fouten: [] } | { concept: null; fouten: string[] } {
  const fouten: string[] = [];
  const btwStand = btwInstellingVan(w);
  const regels: BestelRegel[] = [];
  const perProduct = new Map<string, number>();
  if (!invoer.length) return { concept: null, fouten: ["Het mandje is leeg."] };
  if (invoer.length > KASSA_MAX_REGELS) return { concept: null, fouten: ["Het mandje is te vol. Reken in twee keer af."] };

  for (const r of invoer) {
    if (!Number.isInteger(r.aantal) || r.aantal < 1 || r.aantal > 99) {
      fouten.push("Een aantal moet tussen 1 en 99 liggen.");
      continue;
    }
    if ("los" in r) {
      const naam = r.los.trim().slice(0, 80) || "Los bedrag";
      if (!Number.isInteger(r.prijsCents) || r.prijsCents <= 0 || r.prijsCents > KASSA_MAX_LOS_CENTS) {
        fouten.push(`Het bedrag van "${naam}" klopt niet.`);
        continue;
      }
      regels.push({ productId: "", naam, prijsCents: r.prijsCents, aantal: r.aantal, totaalCents: r.prijsCents * r.aantal, ...(btwStand ? { btw: btwStand.standaard } : {}) });
      continue;
    }
    const p = w.producten.find((x) => x.id === r.productId);
    if (!p) {
      fouten.push("Een product in het mandje bestaat niet meer. Haal het weg en probeer opnieuw.");
      continue;
    }
    if (isUitverkocht(p)) {
      fouten.push(`${p.naam} is uitverkocht.`);
      continue;
    }
    const opties = p.opties ?? [];
    const gekozen = r.variant ? r.variant.split(", ") : [];
    if (gekozen.length !== opties.length || opties.some((o, i) => !o.waarden.includes(gekozen[i] ?? ""))) {
      fouten.push(opties.length ? `Kies opnieuw de ${opties.map((o) => o.naam.toLowerCase()).join(" en ")} van ${p.naam}.` : `${p.naam} heeft geen keuzes.`);
      continue;
    }
    perProduct.set(p.id, (perProduct.get(p.id) ?? 0) + r.aantal);
    const variant = opties.length ? gekozen.join(", ") : undefined;
    regels.push({
      productId: p.id,
      naam: variant ? `${p.naam} (${variant})` : p.naam,
      ...(variant ? { variant } : {}),
      prijsCents: p.prijsCents,
      aantal: r.aantal,
      totaalCents: p.prijsCents * r.aantal,
      ...(btwStand ? { btw: tariefVan(p, btwStand) } : {}),
    });
  }
  for (const [id, aantal] of perProduct) {
    const p = w.producten.find((x) => x.id === id);
    if (p && p.voorraad != null && aantal > p.voorraad) fouten.push(`Van ${p.naam} ${p.voorraad === 1 ? "is er nog 1" : `zijn er nog ${p.voorraad}`}.`);
  }
  if (fouten.length) return { concept: null, fouten };

  const subtotaalCents = regels.reduce((s, r) => s + r.totaalCents, 0);
  const btw = btwStand ? btwOverzicht(btwStand, regels.map((r) => ({ cents: r.totaalCents, tarief: r.btw ?? btwStand.standaard })), 0) : undefined;
  const btwErbij = btw && !btw.inclusief && !btw.kor ? btw.totaalCents : 0;
  return {
    concept: {
      regels,
      subtotaalCents,
      bezorgkostenCents: 0,
      totaalCents: subtotaalCents + btwErbij,
      invoer: { ...LEGE_INVOER, naam: KASSA_KLANT },
      ...(btw ? { btw } : {}),
    },
    fouten: [],
  };
}

/** De bon van een verkoop in de winkel, uit de bewaarde bestelling. */
export function bonVanVerkoop(
  b: Pick<Bestelconcept, "regels" | "totaalCents" | "btw"> & { nr: string; at: string; kassa: { methode: KassaMethode; ontvangenCents?: number | undefined; wisselgeldCents?: number | undefined } },
  bedrijf: { naam: string; straat?: string; postcode?: string; plaats?: string; telefoon?: string },
): KassaBon {
  const adres = [bedrijf.straat, [bedrijf.postcode, bedrijf.plaats].filter(Boolean).join(" ")].filter((s) => s?.trim()).join(", ");
  return {
    nr: b.nr,
    op: b.at,
    winkel: { naam: bedrijf.naam || "Onze winkel", ...(adres ? { adres } : {}), ...(bedrijf.telefoon ? { telefoon: bedrijf.telefoon } : {}) },
    regels: b.regels.map((r, i) => ({ sleutel: String(i), productId: r.productId || null, naam: r.naam, ...(r.variant ? { variant: r.variant } : {}), prijsCents: r.prijsCents, aantal: r.aantal })),
    totaalCents: b.totaalCents,
    methode: b.kassa.methode,
    ...(b.kassa.methode === "contant" ? { ontvangenCents: b.kassa.ontvangenCents ?? b.totaalCents, wisselgeldCents: b.kassa.wisselgeldCents ?? 0 } : {}),
    ...(b.btw ? { btw: b.btw } : {}),
  };
}

export interface KassaDag {
  aantal: number;
  totaalCents: number;
  contantCents: number;
  pinCents: number;
}

/** Wat er vandaag (Nederlandse dag) in de winkel is verkocht, per betaalwijze; geannuleerde verkopen tellen niet. */
export function kassaDag(
  verkopen: readonly { at: string; status: string; totaalCents: number; kanaal?: string | undefined; kassa?: { methode: KassaMethode } | undefined }[],
  nu: Date,
): KassaDag {
  const dag = amsterdamDayKey(nu);
  const uit: KassaDag = { aantal: 0, totaalCents: 0, contantCents: 0, pinCents: 0 };
  for (const v of verkopen) {
    if (v.kanaal !== "winkel" || !v.kassa || v.status === "geannuleerd" || amsterdamDayKey(new Date(v.at)) !== dag) continue;
    uit.aantal += 1;
    uit.totaalCents += v.totaalCents;
    if (v.kassa.methode === "contant") uit.contantCents += v.totaalCents;
    else uit.pinCents += v.totaalCents;
  }
  return uit;
}
