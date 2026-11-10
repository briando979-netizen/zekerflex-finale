import { LEGE_WINKEL, slugify, type BetaalMethode, type SiteProduct, type Winkel } from "@/lib/sites/types";
import { euro } from "@/lib/sites/euro";
import { betaalOpties, betaalPast, schoonIban } from "@/lib/sites/winkel-betalen";
import { btwInstellingVan, btwOverzicht, tariefVan, verdeel, type BtwOverzicht } from "@/lib/sites/winkel-btw";
import { controleerKorting, normaliseerCode } from "@/lib/sites/winkel-korting";
import { ANDER_LAND, actieveVerzendmethoden, bezorgtNaar, landKeuze, landNaam, leesLand, verzendKosten } from "@/lib/sites/winkel-verzending";

// ---------------------------------------------------------------------------
// De winkel van een klantsite: rekenen en controleren, zonder opslag of HTML.
// Client-veilig (de bouwer gebruikt dezelfde regels). Een bestelling rekent
// altijd met de prijzen van de gepubliceerde site, nooit met wat een formulier
// meestuurt. Weergave: lib/sites/winkel-render.ts; opslag: lib/sites/bestellingen.ts.
// ---------------------------------------------------------------------------

export const MAX_PER_PRODUCT = 99;

/** 1250 → "€ 12,50" (lib/sites/euro.ts; hier doorgegeven, zodat bestaande imports blijven werken). */
export { euro };

/** Wat iemand als bedrag typt ("€ 1.250,50", "4,5", "4.50") → centen; null als het geen bedrag is. */
export function leesBedrag(tekst: string): number | null {
  let s = tekst.replace(/[€\s]/g, "");
  if (!s) return null;
  s = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.round(n * 100) : null;
}

export const winkelVan = (site: { winkel?: Winkel | undefined }): Winkel => site.winkel ?? LEGE_WINKEL;

/** Uitverkocht: met de hand aangezet, of de bijgehouden voorraad is op. */
export const isUitverkocht = (p: Pick<SiteProduct, "uitverkocht" | "voorraad">): boolean => p.uitverkocht || (p.voorraad != null && p.voorraad <= 0);

/** Hoeveel er in één keer te bestellen is: 99, of minder als de voorraad lager is. */
export const maxBestelbaar = (p: Pick<SiteProduct, "voorraad">): number => Math.max(0, Math.min(MAX_PER_PRODUCT, p.voorraad ?? MAX_PER_PRODUCT));

/** Na een bestelling: de bijgehouden voorraad omlaag (nooit onder 0); producten zonder bijgehouden voorraad blijven zoals ze zijn. */
export function verlaagVoorraad(w: Winkel, regels: Pick<BestelRegel, "productId" | "aantal">[]): Winkel {
  const besteld = new Map<string, number>();
  for (const r of regels) besteld.set(r.productId, (besteld.get(r.productId) ?? 0) + r.aantal);
  return { ...w, producten: w.producten.map((p) => (p.voorraad != null && besteld.has(p.id) ? { ...p, voorraad: Math.max(0, p.voorraad - (besteld.get(p.id) ?? 0)) } : p)) };
}

export const MAX_OPTIES = 2;

/** Wat bezoekers zien: zichtbare producten, in de volgorde van de bouwer. */
export const zichtbareProducten = (w: Winkel): SiteProduct[] => w.producten.filter((p) => p.zichtbaar);

/** De categorieën in de volgorde waarin ze voor het eerst voorkomen; zonder categorie telt niet mee. */
export function categorieen(producten: SiteProduct[]): string[] {
  return [...new Set(producten.map((p) => p.categorie.trim()).filter(Boolean))];
}

/** Een uniek webadres voor een product ("Desembrood wit" → "desembrood-wit", bij een dubbele "-2"). */
export function productSlug(naam: string, bestaand: string[]): string {
  const basis = slugify(naam) || "product";
  let slug = basis;
  for (let n = 2; bestaand.includes(slug); n++) slug = `${basis}-${n}`;
  return slug;
}

export type Levering = "afhalen" | "bezorgen";

export interface BestelInvoer {
  /**
   * regel → aantal. Een regel is het product-id, of voor een tweede (derde…) maat of kleur van
   * hetzelfde product "<id>-1", "<id>-2" (uit de winkelmand, lib/sites/mand.ts)
   */
  aantallen: Record<string, number>;
  /** regel → de gekozen waarde per optie (maat, kleur), in de volgorde van de opties */
  keuzes: Record<string, string[]>;
  levering: Levering;
  naam: string;
  email: string;
  telefoon: string;
  straat: string;
  postcode: string;
  plaats: string;
  opmerking: string;
  /** het nummer van de gekozen verzendmethode (lib/sites/winkel-verzending.ts); leeg = volgens `levering` */
  verzend?: string | undefined;
  /** het land van het bezorgadres (lib/sites/winkel-verzending.ts EU_LANDEN, of ANDER_LAND); leeg = Nederland */
  land?: string | undefined;
  /** bij ANDER_LAND: welk land */
  landAnders?: string | undefined;
  /** de gekozen betaalmethode (lib/sites/winkel-betalen.ts) */
  betaalmethode?: string | undefined;
  kortingscode?: string | undefined;
}

/** Een leeg formulier (de bestelpagina vult er één product in vanaf een productpagina). */
export const LEGE_INVOER: BestelInvoer = { aantallen: {}, keuzes: {}, levering: "afhalen", naam: "", email: "", telefoon: "", straat: "", postcode: "", plaats: "", opmerking: "" };

/** Een bestelnummer zoals lib/sites/bestellingen.ts ze maakt: zes tekens zonder 0/O, 1/I/L. */
export const isBestelnummer = (s: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(s);

export interface BestelRegel {
  productId: string;
  /** met de gekozen variant erachter: "Hoodie (M, Zwart)" */
  naam: string;
  /** de gekozen variant: "M, Zwart" */
  variant?: string | undefined;
  prijsCents: number;
  aantal: number;
  totaalCents: number;
  /** het btw-tarief van dit product, als de winkel btw heeft ingesteld */
  btw?: number | undefined;
}

/** De verzendmethode zoals de klant hem koos, bewaard bij de bestelling. */
export interface BestelVerzending {
  id: string;
  soort: Levering;
  naam: string;
  /** afhalen: waar; leeg = het adres van het bedrijf */
  adres: string;
  levertijd: string;
  /** bezorgen: het land van het adres, voluit ("Nederland") */
  land: string;
}

/**
 * Een bestelling, uitgerekend met de prijzen en regels van de winkel. Bedragen zoals de winkel rekent
 * (inclusief btw, of exclusief als Winkel.btw dat zegt; dan staat de btw in `btw` en zit hij in het totaal).
 * De velden na `invoer` ontbreken bij bestellingen van vóór 10 nov 2026.
 */
export interface Bestelconcept {
  regels: BestelRegel[];
  /** de producten samen, vóór korting */
  subtotaalCents: number;
  /** de kosten van de gekozen verzendmethode (ook bij afhalen, meestal 0) */
  bezorgkostenCents: number;
  totaalCents: number;
  invoer: BestelInvoer;
  verzending?: BestelVerzending | undefined;
  korting?: { id: string; code: string; cents: number } | undefined;
  btw?: BtwOverzicht | undefined;
  betaalmethode?: BetaalMethode | undefined;
  /** bij overboeking: de rekening zoals de winkel hem had toen de klant bestelde */
  rekening?: { iban: string; naam: string } | undefined;
}

/** Wat de bedankpagina van een bestelling laat zien: alles behalve de gegevens van de klant. */
export type BestelOverzicht = Omit<Bestelconcept, "invoer">;

/** De regels van een product in het bestelformulier: het id zelf, dan "<id>-1" tot "<id>-9" (andere maten of kleuren). */
export const regelSleutels = (productId: string): string[] => [productId, ...Array.from({ length: 9 }, (_, i) => `${productId}-${i + 1}`)];

const knip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** Het bestelformulier uitlezen: n_<productId> = aantal, k_<productId>_<optie> = keuze, de rest als tekst met een maximum. */
export function leesBestelForm(form: { get(naam: string): unknown } & Iterable<[string, unknown]>): BestelInvoer {
  const aantallen: Record<string, number> = {};
  const keuzes: Record<string, string[]> = {};
  for (const [naam, waarde] of form) {
    const k = /^k_(p[a-z0-9]{6,20}(?:-[1-9])?)_([01])$/.exec(naam);
    if (k?.[1] && k[2]) {
      (keuzes[k[1]] ??= [])[Number(k[2])] = knip(waarde, 40);
      continue;
    }
    const m = /^n_(p[a-z0-9]{6,20}(?:-[1-9])?)$/.exec(naam);
    if (!m?.[1]) continue;
    const n = Math.floor(Number(waarde));
    if (Number.isFinite(n) && n > 0) aantallen[m[1]] = Math.min(MAX_PER_PRODUCT, n);
  }
  return {
    aantallen,
    keuzes,
    levering: form.get("levering") === "bezorgen" ? "bezorgen" : "afhalen",
    naam: knip(form.get("naam"), 100),
    email: knip(form.get("email"), 200),
    telefoon: knip(form.get("telefoon"), 30),
    straat: knip(form.get("straat"), 120),
    postcode: knip(form.get("postcode"), 10),
    plaats: knip(form.get("plaats"), 80),
    opmerking: knip(form.get("opmerking"), 1000),
    verzend: knip(form.get("verzend"), 24),
    land: knip(form.get("land"), 2).toUpperCase(),
    landAnders: knip(form.get("landAnders"), 60),
    betaalmethode: knip(form.get("betaalmethode"), 20),
    kortingscode: normaliseerCode(knip(form.get("kortingscode"), 30)).slice(0, 20),
  };
}

/**
 * De bestelling uitrekenen en controleren tegen de winkel van de site. Fouten
 * zijn zinnen voor de bezoeker; zonder fouten is er een concept om te bevestigen.
 * Alle bedragen komen van de winkel zelf: verzendmethode, betaalmethode en
 * kortingscode zijn alleen een keuze uit wat de winkel aanbiedt. `kortingGebruikt`:
 * hoe vaak de ingevulde code al gebruikt is (de server telt, lib/sites/korting-gebruik.ts).
 */
export function berekenBestelling(w: Winkel, invoer: BestelInvoer, extra: { nu?: Date | undefined; kortingGebruikt?: number | undefined } = {}): { concept: Bestelconcept | null; fouten: string[] } {
  const fouten: string[] = [];
  if (!w.bestellen) return { concept: null, fouten: ["Online bestellen staat op deze website uit."] };
  const btwStand = btwInstellingVan(w);

  const regels: BestelRegel[] = [];
  for (const p of zichtbareProducten(w)) {
    // een product kan meer regels hebben: elke andere maat of kleur uit de winkelmand een eigen regel
    const sleutels = regelSleutels(p.id).filter((k) => (invoer.aantallen[k] ?? 0) > 0);
    if (!sleutels.length) continue;
    const totaal = sleutels.reduce((som, k) => som + (invoer.aantallen[k] ?? 0), 0);
    if (isUitverkocht(p)) {
      fouten.push(`${p.naam} is uitverkocht.`);
      continue;
    }
    if (p.voorraad != null && totaal > p.voorraad) {
      fouten.push(`Van ${p.naam} ${p.voorraad === 1 ? "is er nog 1" : `zijn er nog ${p.voorraad}`}.`);
      continue;
    }
    for (const k of sleutels) {
      const aantal = invoer.aantallen[k] ?? 0;
      // elke optie (maat, kleur) moet een bestaande keuze hebben
      const gekozen = invoer.keuzes[k] ?? [];
      const opties = p.opties ?? [];
      const mist = opties.find((o, i) => !o.waarden.includes(gekozen[i] ?? ""));
      if (mist) {
        fouten.push(`Kies ${mist.naam.toLowerCase()} bij ${p.naam}.`);
        continue;
      }
      const variant = opties.length ? opties.map((_, i) => gekozen[i]).join(", ") : undefined;
      regels.push({
        productId: p.id,
        naam: variant ? `${p.naam} (${variant})` : p.naam,
        ...(variant ? { variant } : {}),
        prijsCents: p.prijsCents,
        aantal,
        totaalCents: p.prijsCents * aantal,
        ...(btwStand ? { btw: tariefVan(p, btwStand) } : {}),
      });
    }
  }
  if (!regels.length && !fouten.length) fouten.push("Kies bij minstens één product hoeveel je wilt bestellen.");

  // verzenden: de gekozen methode; een formulier zonder keuze (van vóór de verzendmethoden) kiest op afhalen of bezorgen
  const methoden = actieveVerzendmethoden(w);
  const methode = invoer.verzend ? methoden.find((m) => m.id === invoer.verzend) : (methoden.find((m) => m.soort === invoer.levering) ?? methoden[0]);
  if (!methoden.length) fouten.push("Deze winkel heeft nog geen manier ingesteld om je bestelling te krijgen. Neem contact op met de winkel.");
  else if (!methode) fouten.push("Die verzendmethode is er niet meer. Kies een andere.");
  const levering: Levering = methode?.soort ?? "afhalen";
  // het land: alleen te kiezen als de winkel ook buiten Nederland bezorgt
  const land = levering === "bezorgen" ? (landKeuze(methoden) === "nl" ? "NL" : leesLand(invoer.land)) : "";
  const landAnders = land === ANDER_LAND ? (invoer.landAnders ?? "").trim() : "";

  if (!invoer.naam) fouten.push("Vul je naam in.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(invoer.email)) fouten.push("Vul een geldig e-mailadres in.");
  if (invoer.telefoon.replace(/\D/g, "").length < 8) fouten.push("Vul je telefoonnummer in, dan kunnen we je bellen over je bestelling.");
  if (levering === "bezorgen" && (!invoer.straat || !invoer.postcode || !invoer.plaats)) fouten.push("Vul je adres in voor de bezorging (straat en huisnummer, postcode en plaats).");
  if (methode?.soort === "bezorgen") {
    if (land === ANDER_LAND && !landAnders) fouten.push("Schrijf op naar welk land we je bestelling sturen.");
    else if (!bezorgtNaar(methode.gebied, land)) fouten.push(`${methode.naam} bezorgt niet in ${landNaam(land, landAnders)}. Kies een andere verzendmethode of een ander land.`);
  }

  // betalen: een keuze uit wat de winkel aanbiedt (een winkel zonder betaalmethoden toont alleen zijn betaaltekst)
  const betaalKeuzes = betaalOpties(w);
  const betaal = betaalKeuzes.find((m) => m === invoer.betaalmethode) ?? (betaalKeuzes.length === 1 ? betaalKeuzes[0] : undefined);
  if (betaalKeuzes.length && !betaal) fouten.push("Kies hoe je wilt betalen.");
  if (betaal && methode && !betaalPast(betaal, methode.soort)) {
    fouten.push(
      betaal === "afhalen"
        ? "Betalen bij afhalen kan alleen als je de bestelling afhaalt. Kies een andere manier van betalen of van verzenden."
        : "Contant bij bezorgen kan alleen als je de bestelling laat bezorgen. Kies een andere manier van betalen of van verzenden.",
    );
  }

  // de kortingscode: op het bedrag aan producten, met het gebruik zoals de server het telde
  const subtotaalCents = regels.reduce((som, r) => som + r.totaalCents, 0);
  const code = normaliseerCode(invoer.kortingscode ?? "");
  const korting = code && regels.length ? controleerKorting(w.kortingscodes, code, { productenCents: subtotaalCents, nu: extra.nu ?? new Date(), gebruikt: extra.kortingGebruikt ?? 0 }) : null;
  if (korting && !korting.ok) fouten.push(korting.fout);

  if (fouten.length || !methode) return { concept: null, fouten };
  const kortingCents = korting?.ok ? korting.kortingCents : 0;
  const productenCents = subtotaalCents - kortingCents;
  // gratis verzenden telt vanaf het bedrag na korting
  const bezorgkostenCents = verzendKosten(methode, productenCents);
  // btw: de korting naar verhouding van de regels eraf, de verzendkosten naar verhouding erbij
  let btw: BtwOverzicht | undefined;
  if (btwStand) {
    const aandeel = verdeel(
      regels.map((r) => r.totaalCents),
      kortingCents,
    );
    btw = btwOverzicht(btwStand, regels.map((r, i) => ({ cents: r.totaalCents - (aandeel[i] ?? 0), tarief: r.btw ?? btwStand.standaard })), bezorgkostenCents);
  }
  const btwErbij = btw && !btw.inclusief && !btw.kor ? btw.totaalCents : 0;
  const rekening = betaal === "overboeking" && w.betalen ? { iban: schoonIban(w.betalen.iban), naam: w.betalen.tenaamstelling.trim() } : undefined;
  return {
    concept: {
      regels,
      subtotaalCents,
      bezorgkostenCents,
      totaalCents: productenCents + bezorgkostenCents + btwErbij,
      invoer: { ...invoer, levering, verzend: methode.id, land, landAnders, betaalmethode: betaal ?? "", kortingscode: korting?.ok ? korting.korting.code : "" },
      verzending: { id: methode.id, soort: methode.soort, naam: methode.naam, adres: methode.soort === "afhalen" ? methode.adres.trim() : "", levertijd: methode.levertijd.trim(), land: land ? landNaam(land, landAnders) : "" },
      ...(korting?.ok ? { korting: { id: korting.korting.id, code: korting.korting.code, cents: kortingCents } } : {}),
      ...(btw ? { btw } : {}),
      ...(betaal ? { betaalmethode: betaal } : {}),
      ...(rekening ? { rekening } : {}),
    },
    fouten: [],
  };
}
