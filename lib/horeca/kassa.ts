import type { BestelRegel } from "@/lib/horeca/bestellen";

// ---------------------------------------------------------------------------
// De kassa van het horeca-pakket: wat er aan een tafel nog open staat, splitsen
// (gelijk of per gerecht), fooi, wisselgeld, de btw-specificatie op de bon en
// de dagafsluiting (Z-rapport) voor de boekhouding. Bedragen zijn altijd in
// cent en inclusief btw, zoals op de menukaart. Puur, dus ook in de browser
// bruikbaar en los te testen.
// ---------------------------------------------------------------------------

export const METHODEN = ["pin", "contant", "ideal", "overig"] as const;
export type Methode = (typeof METHODEN)[number];
export const METHODE_LABEL: Record<Methode, string> = { pin: "Pin", contant: "Contant", ideal: "iDEAL", overig: "Overig" };

/**
 * Online aan tafel betaald (via Stripe): na de betaling weten we waarmee. Deze
 * staan niet in de kassa om te kiezen, maar wel op de bon en in het Z-rapport.
 */
export const ONLINE_LABEL: Record<string, string> = { kaart: "Pas", apple_pay: "Apple Pay", google_pay: "Google Pay" };

/** De naam van een betaalwijze op de bon en in het Z-rapport. */
export function methodeLabel(m: string): string {
  if (Object.hasOwn(METHODE_LABEL, m)) return METHODE_LABEL[m as Methode];
  return (Object.hasOwn(ONLINE_LABEL, m) ? ONLINE_LABEL[m] : undefined) ?? m;
}

/** De Nederlandse btw-tarieven: eten en alcoholvrij 9 %, alcohol 21 %. */
export const BTW_TARIEVEN = [9, 21, 0] as const;
export type BtwTarief = (typeof BTW_TARIEVEN)[number];
export const isBtw = (n: unknown): n is BtwTarief => typeof n === "number" && (BTW_TARIEVEN as readonly number[]).includes(n);
export const STANDAARD_BTW: BtwTarief = 9;

/** Een regel zoals hij op de rekening staat: wat er van een bestelregel nog betaald moet worden. */
export interface RekeningRegel {
  bestellingId: string;
  index: number;
  nummer: number;
  naam: string;
  prijsCent: number;
  /** nog te betalen stuks */
  aantal: number;
  btw: BtwTarief;
}

export interface RekeningBestelling {
  id: string;
  nummer: number;
  status: string;
  betaald: boolean;
  regels: BestelRegel[];
}

const open = (r: BestelRegel) => Math.max(0, r.aantal - (r.betaaldAantal ?? 0));

/** Alles wat aan een tafel nog open staat, per regel. Geannuleerd of al betaald telt niet. */
export function rekeningVan(bestellingen: readonly RekeningBestelling[]): RekeningRegel[] {
  return bestellingen
    .filter((b) => !b.betaald && b.status !== "GEANNULEERD")
    .flatMap((b) =>
      b.regels.flatMap((r, index) =>
        open(r) > 0 ? [{ bestellingId: b.id, index, nummer: b.nummer, naam: r.keuze ? `${r.naam} (${r.keuze})` : r.naam, prijsCent: r.prijsCent, aantal: open(r), btw: isBtw(r.btw) ? r.btw : STANDAARD_BTW }] : [],
      ),
    );
}

export const totaalVan = (regels: readonly { prijsCent: number; aantal: number }[]) => regels.reduce((s, r) => s + r.prijsCent * r.aantal, 0);

/** Het btw-deel van een bedrag inclusief btw (afgerond op hele centen). */
export const btwIn = (inclCent: number, tarief: number) => Math.round((inclCent * tarief) / (100 + tarief));

export interface BtwRegel {
  tarief: number;
  inclCent: number;
  btwCent: number;
  exclCent: number;
}

/** Per tarief: bedrag inclusief, btw en exclusief (voor op de bon en in de dagafsluiting). */
export function btwSpecificatie(regels: readonly { prijsCent: number; aantal: number; btw: number }[]): BtwRegel[] {
  const per = new Map<number, number>();
  for (const r of regels) per.set(r.btw, (per.get(r.btw) ?? 0) + r.prijsCent * r.aantal);
  return [...per.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([tarief, inclCent]) => {
      const btwCent = btwIn(inclCent, tarief);
      return { tarief, inclCent, btwCent, exclCent: inclCent - btwCent };
    });
}

/** Een bedrag eerlijk over n personen: samen precies het totaal (de eersten betalen een cent meer). */
export function verdeelGelijk(totaalCent: number, n: number): number[] {
  const delen = Math.max(1, Math.min(50, Math.floor(n)));
  const basis = Math.floor(totaalCent / delen);
  const rest = totaalCent - basis * delen;
  return Array.from({ length: delen }, (_, i) => basis + (i < rest ? 1 : 0));
}

export interface BonRegel {
  naam: string;
  prijsCent: number;
  aantal: number;
  btw: number;
}

export const MAX_KORTING_PROCENT = 100;

/**
 * Korting (een percentage) als min-regels op de bon, één per btw-tarief: zo blijft de btw per tarief kloppen
 * (15 nov 2026, de kassa zoals bij een bon maken). Afgerond op hele centen per tarief.
 */
export function kortingRegels(regels: readonly BonRegel[], procent: number): BonRegel[] {
  const p = Math.round(procent);
  if (!(p > 0)) return [];
  const per = new Map<number, number>();
  for (const r of regels) per.set(r.btw, (per.get(r.btw) ?? 0) + r.prijsCent * r.aantal);
  return [...per.entries()]
    .sort((a, b) => b[0] - a[0])
    .flatMap(([btw, som]) => {
      const k = Math.round((som * Math.min(MAX_KORTING_PROCENT, p)) / 100);
      return k > 0 ? [{ naam: `Korting ${Math.min(MAX_KORTING_PROCENT, p)}%`, prijsCent: -k, aantal: 1, btw }] : [];
    });
}

/**
 * Bij gelijk (of vrij) splitsen: welk deel van elk btw-tarief iedere betaler
 * betaalt. Per deel klopt het bedrag precies, en samen precies het totaal per
 * tarief, zodat de dagafsluiting per btw-tarief op de cent klopt.
 */
export function deelRegels(regels: readonly BonRegel[], bedragen: readonly number[]): BonRegel[][] {
  const spec = btwSpecificatie(regels);
  const totaal = spec.reduce((s, b) => s + b.inclCent, 0);
  const rest = new Map(spec.map((b) => [b.tarief, b.inclCent]));
  return bedragen.map((bedrag, i) => {
    const n = bedragen.length;
    let delen: [number, number][];
    if (i === n - 1) {
      delen = [...rest.entries()];
    } else {
      delen = spec.map((b) => [b.tarief, Math.min(rest.get(b.tarief) ?? 0, totaal ? Math.floor((bedrag * b.inclCent) / totaal) : 0)]);
      // afrondingsverschil op het tarief met de meeste ruimte
      let tekort = bedrag - delen.reduce((s, [, x]) => s + x, 0);
      const ruimte = (d: [number, number]) => (rest.get(d[0]) ?? 0) - d[1];
      for (const d of [...delen].sort((a, b) => ruimte(b) - ruimte(a))) {
        if (tekort <= 0) break;
        const erbij = Math.min(ruimte(d), tekort);
        d[1] += erbij;
        tekort -= erbij;
      }
    }
    for (const [t, x] of delen) rest.set(t, (rest.get(t) ?? 0) - x);
    return delen.filter(([, x]) => x > 0).map(([tarief, x]) => ({ naam: `Deel ${i + 1} van ${n}`, prijsCent: x, aantal: 1, btw: tarief }));
  });
}

/** Wisselgeld bij contant; null als het gegeven bedrag te laag is. */
export const wisselgeld = (teBetalenCent: number, gegevenCent: number) => (gegevenCent >= teBetalenCent ? gegevenCent - teBetalenCent : null);

/** Snelle fooi-knoppen: afronden naar boven op hele euro's (en op 5 euro), 5 % en 10 %. */
export function fooiOpties(totaalCent: number): { label: string; fooiCent: number }[] {
  const opties: { label: string; fooiCent: number }[] = [];
  const opEuro = Math.ceil(totaalCent / 100) * 100 - totaalCent;
  if (opEuro > 0) opties.push({ label: `Afronden op € ${Math.ceil(totaalCent / 100)}`, fooiCent: opEuro });
  const opVijf = Math.ceil(totaalCent / 500) * 500 - totaalCent;
  if (opVijf > opEuro) opties.push({ label: `Afronden op € ${Math.ceil(totaalCent / 500) * 5}`, fooiCent: opVijf });
  opties.push({ label: "5 %", fooiCent: Math.round(totaalCent * 0.05) }, { label: "10 %", fooiCent: Math.round(totaalCent * 0.1) });
  return opties.filter((o) => o.fooiCent > 0);
}

/** Een betaalde selectie: hoeveel stuks van welke regel van welke bestelling. */
export interface Selectie {
  bestellingId: string;
  index: number;
  aantal: number;
}

/**
 * Een betaling verwerken in de regels van één bestelling: betaaldAantal omhoog,
 * nooit verder dan het aantal. Geeft de nieuwe regels en of de bestelling nu
 * helemaal betaald is. Een selectie die meer vraagt dan er open staat, is een fout.
 */
export function betaalRegels(regels: readonly BestelRegel[], selectie: readonly Omit<Selectie, "bestellingId">[]): { regels: BestelRegel[]; helemaal: boolean } | { fout: string } {
  const uit = regels.map((r) => ({ ...r }));
  for (const s of selectie) {
    const r = uit[s.index];
    if (!r) return { fout: "Een regel staat niet (meer) op de rekening. Ververs de rekening." };
    if (!Number.isInteger(s.aantal) || s.aantal < 1 || s.aantal > open(r)) return { fout: `Van ${r.naam} staat nog ${open(r)} open.` };
    r.betaaldAantal = (r.betaaldAantal ?? 0) + s.aantal;
  }
  return { regels: uit, helemaal: uit.every((r) => open(r) === 0) };
}

/**
 * Rondt deze selectie de bestelling af: staat er daarna niets meer van open? Dan horen de bezorgkosten op deze bon
 * (één keer, op de laatste betaling). Server en kassascherm gebruiken dezelfde regel.
 */
export function rondtAf(rekening: readonly RekeningRegel[], selectie: readonly Selectie[], bestellingId: string): boolean {
  const open = rekening.filter((r) => r.bestellingId === bestellingId);
  return open.length > 0 && open.every((r) => selectie.some((s) => s.bestellingId === bestellingId && s.index === r.index && s.aantal >= r.aantal));
}

/** De hele rekening als selectie (alles afrekenen). */
export const alles = (rekening: readonly RekeningRegel[]): Selectie[] => rekening.map((r) => ({ bestellingId: r.bestellingId, index: r.index, aantal: r.aantal }));

// ── Dagafsluiting (Z-rapport) ────────────────────────────────────────────────

export interface KassaBetaling {
  bedragCent: number;
  fooiCent: number;
  methode: string;
  /** wat er betaald werd, met prijs en btw (snapshot voor de bon) */
  regels: BonRegel[];
}

export interface ZRapport {
  bonnen: number;
  omzetCent: number;
  fooiCent: number;
  perMethode: { methode: string; label: string; bedragCent: number; fooiCent: number; aantal: number }[];
  btw: BtwRegel[];
  /** verwacht contant in de la: contant + fooi contant */
  contantCent: number;
}

export function zRapport(betalingen: readonly KassaBetaling[]): ZRapport {
  const per = new Map<string, { bedragCent: number; fooiCent: number; aantal: number }>();
  for (const b of betalingen) {
    const x = per.get(b.methode) ?? { bedragCent: 0, fooiCent: 0, aantal: 0 };
    x.bedragCent += b.bedragCent;
    x.fooiCent += b.fooiCent;
    x.aantal += 1;
    per.set(b.methode, x);
  }
  const contant = per.get("contant");
  return {
    bonnen: betalingen.length,
    omzetCent: betalingen.reduce((s, b) => s + b.bedragCent, 0),
    fooiCent: betalingen.reduce((s, b) => s + b.fooiCent, 0),
    perMethode: [...per.entries()]
      .map(([methode, x]) => ({ methode, label: methodeLabel(methode), ...x }))
      .sort((a, b) => b.bedragCent - a.bedragCent),
    btw: btwSpecificatie(betalingen.flatMap((b) => b.regels)),
    contantCent: (contant?.bedragCent ?? 0) + (contant?.fooiCent ?? 0),
  };
}

// ── Dagstaat voor de boekhouder (memoriaalboeking per dag) ───────────────────

/** Waarop het geld binnenkwam, als kolommen op de dagstaat. Online aan tafel (pas, Apple Pay, Google Pay) staat samen. */
export const DAGSTAAT_ONTVANGSTEN = [
  ["pin", "Ontvangen pin"],
  ["contant", "Ontvangen contant"],
  ["ideal", "Ontvangen iDEAL"],
  ["online", "Ontvangen online aan tafel"],
  ["overig", "Ontvangen overig"],
] as const;
export type Ontvangst = (typeof DAGSTAAT_ONTVANGSTEN)[number][0];

export const ontvangstVan = (methode: string): Ontvangst => (methode === "pin" || methode === "contant" || methode === "ideal" ? methode : Object.hasOwn(ONLINE_LABEL, methode) ? "online" : "overig");

export interface DagstaatDag {
  datum: string;
  betalingen: readonly KassaBetaling[];
  /** wat er bij de dagafsluiting in de la geteld is (zonder wisselgeld); null als er niet geteld is */
  geteldCent: number | null;
}

export interface DagstaatRij {
  datum: string;
  bonnen: number;
  omzetCent: number;
  /** per tarief: omzet exclusief btw en de btw */
  btw: Record<BtwTarief, { exclCent: number; btwCent: number }>;
  fooiCent: number;
  /** per betaalwijze, inclusief fooi: wat er op de bank of in de la kwam */
  ontvangen: Record<Ontvangst, number>;
  geteldCent: number | null;
  /** geteld min wat er contant in de la hoort (contant plus fooi contant); null als er niet geteld is */
  kasVerschilCent: number | null;
}

/**
 * Eén dag van de dagstaat. Hij sluit: omzet exclusief plus btw per tarief plus fooi is samen precies wat er
 * ontvangen is, zodat de boekhouder hem als één memoriaalboeking kan inlezen (ontvangsten debet, omzet, btw en
 * fooi credit). De btw per tarief is berekend over het dagtotaal, net als in het Z-rapport.
 */
export function dagstaatRij(dag: DagstaatDag): DagstaatRij {
  const z = zRapport(dag.betalingen);
  const btw: DagstaatRij["btw"] = { 21: { exclCent: 0, btwCent: 0 }, 9: { exclCent: 0, btwCent: 0 }, 0: { exclCent: 0, btwCent: 0 } };
  for (const b of z.btw) if (isBtw(b.tarief)) btw[b.tarief] = { exclCent: b.exclCent, btwCent: b.btwCent };
  const ontvangen: DagstaatRij["ontvangen"] = { pin: 0, contant: 0, ideal: 0, online: 0, overig: 0 };
  for (const b of dag.betalingen) ontvangen[ontvangstVan(b.methode)] += b.bedragCent + b.fooiCent;
  return {
    datum: dag.datum,
    bonnen: z.bonnen,
    omzetCent: z.omzetCent,
    btw,
    fooiCent: z.fooiCent,
    ontvangen,
    geteldCent: dag.geteldCent,
    kasVerschilCent: dag.geteldCent === null ? null : dag.geteldCent - z.contantCent,
  };
}

/** De dagstaat als CSV (puntkomma's, Nederlandse bedragen, opent in Excel): een regel per dag en een totaalregel. */
export function dagstaatCsv(dagen: readonly DagstaatDag[]): string {
  const rijen = dagen.map(dagstaatRij);
  const bedrag = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const som = (f: (r: DagstaatRij) => number) => rijen.reduce((s, r) => s + f(r), 0);
  const ontvangenTotaal = (r: Pick<DagstaatRij, "ontvangen">) => DAGSTAAT_ONTVANGSTEN.reduce((s, [k]) => s + r.ontvangen[k], 0);
  const cijfers = (r: Omit<DagstaatRij, "datum" | "geteldCent" | "kasVerschilCent">) => [
    String(r.bonnen),
    bedrag(r.omzetCent),
    bedrag(r.btw[21].exclCent),
    bedrag(r.btw[21].btwCent),
    bedrag(r.btw[9].exclCent),
    bedrag(r.btw[9].btwCent),
    bedrag(r.btw[0].exclCent),
    bedrag(r.fooiCent),
    ...DAGSTAAT_ONTVANGSTEN.map(([k]) => bedrag(r.ontvangen[k])),
    bedrag(ontvangenTotaal(r)),
  ];
  const kop = ["Datum", "Bonnen", "Omzet incl. btw", "Omzet 21% excl. btw", "Btw 21%", "Omzet 9% excl. btw", "Btw 9%", "Omzet 0%", "Fooi", ...DAGSTAAT_ONTVANGSTEN.map(([, label]) => label), "Totaal ontvangen", "Kas geteld", "Kasverschil"];
  const dagRijen = rijen.map((r) => [r.datum, ...cijfers(r), r.geteldCent === null ? "" : bedrag(r.geteldCent), r.kasVerschilCent === null ? "" : bedrag(r.kasVerschilCent)]);
  const geteld = rijen.filter((r) => r.kasVerschilCent !== null);
  const totaal = [
    "Totaal",
    ...cijfers({
      bonnen: som((r) => r.bonnen),
      omzetCent: som((r) => r.omzetCent),
      btw: { 21: { exclCent: som((r) => r.btw[21].exclCent), btwCent: som((r) => r.btw[21].btwCent) }, 9: { exclCent: som((r) => r.btw[9].exclCent), btwCent: som((r) => r.btw[9].btwCent) }, 0: { exclCent: som((r) => r.btw[0].exclCent), btwCent: 0 } },
      fooiCent: som((r) => r.fooiCent),
      ontvangen: { pin: som((r) => r.ontvangen.pin), contant: som((r) => r.ontvangen.contant), ideal: som((r) => r.ontvangen.ideal), online: som((r) => r.ontvangen.online), overig: som((r) => r.ontvangen.overig) },
    }),
    "",
    geteld.length ? bedrag(geteld.reduce((s, r) => s + (r.kasVerschilCent ?? 0), 0)) : "",
  ];
  const veld = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return `﻿${[kop, ...dagRijen, totaal].map((r) => r.map(veld).join(";")).join("\r\n")}`;
}
