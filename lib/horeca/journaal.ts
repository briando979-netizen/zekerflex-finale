import { dagstaatRij, type DagstaatDag, type DagstaatRij, type Ontvangst } from "@/lib/horeca/kassa";

// ---------------------------------------------------------------------------
// De kassa als journaalposten voor een boekhoudprogramma (18 nov 2026). Per dag
// één memoriaalboeking met grootboeknummers: wat er binnenkwam debet, omzet, btw
// en fooi credit. De zaak vult haar eigen grootboeknummers in (die verschillen per
// administratie); het bestand is een CSV die Exact, Twinfield, e-Boekhouden,
// SnelStart en Moneybird als memoriaal kunnen inlezen. Geen rechtstreekse
// koppeling: het bestand gaat via de zaak of de boekhouder. Puur, los te testen.
// ---------------------------------------------------------------------------

export const GROOTBOEK_VELDEN = [
  ["kas", "Kas (contant)", "1000"],
  ["pin", "Pin onderweg", "1220"],
  ["ideal", "iDEAL onderweg", "1230"],
  ["online", "Online aan tafel onderweg", "1240"],
  ["overig", "Overige ontvangsten", "1290"],
  ["omzet21", "Omzet 21%", "8000"],
  ["omzet9", "Omzet 9%", "8010"],
  ["omzet0", "Omzet 0%", "8020"],
  ["btw21", "Af te dragen btw 21%", "1500"],
  ["btw9", "Af te dragen btw 9%", "1510"],
  ["fooi", "Fooien (door te geven aan personeel)", "1700"],
] as const;

export type GrootboekSleutel = (typeof GROOTBOEK_VELDEN)[number][0];
export type Grootboek = Record<GrootboekSleutel, string>;

export const STANDAARD_GROOTBOEK: Grootboek = Object.fromEntries(GROOTBOEK_VELDEN.map(([k, , nr]) => [k, nr])) as Grootboek;

/** Een grootboeknummer: 1 tot 12 letters, cijfers of punten (sommige pakketten gebruiken "8000.1"). */
export const isRekening = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9.]{1,12}$/.test(v);

/** De grootboeknummers van de zaak; wat ontbreekt of niet klopt, krijgt het standaardnummer. */
export function leesGrootboek(json: unknown): Grootboek {
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  return Object.fromEntries(GROOTBOEK_VELDEN.map(([k, , nr]) => [k, isRekening(j[k]) ? j[k] : nr])) as Grootboek;
}

export interface JournaalRegel {
  datum: string;
  rekening: string;
  omschrijving: string;
  debetCent: number;
  creditCent: number;
}

const ONTVANGST_REKENING: Record<Ontvangst, GrootboekSleutel> = { contant: "kas", pin: "pin", ideal: "ideal", online: "online", overig: "overig" };
const ONTVANGST_NAAM: Record<Ontvangst, string> = { contant: "contant", pin: "pin", ideal: "iDEAL", online: "online aan tafel", overig: "overig" };

/**
 * De journaalpost van één dag. Hij sluit altijd (debet = credit), omdat de dagstaat sluit: omzet exclusief plus btw
 * plus fooi is precies wat er binnenkwam. Een negatief bedrag (een dag met meer terug dan verkocht) gaat naar de
 * andere kant, zodat er nooit een min in het bestand staat. Regels van nul vallen weg; een dag zonder omzet is leeg.
 */
export function journaalRegels(rij: DagstaatRij, g: Grootboek): JournaalRegel[] {
  const uit: JournaalRegel[] = [];
  const boek = (rekening: string, omschrijving: string, cent: number, kant: "debet" | "credit") => {
    if (cent === 0) return;
    const debet = (kant === "debet") === cent > 0;
    uit.push({ datum: rij.datum, rekening, omschrijving, debetCent: debet ? Math.abs(cent) : 0, creditCent: debet ? 0 : Math.abs(cent) });
  };
  for (const k of ["contant", "pin", "ideal", "online", "overig"] as const) boek(g[ONTVANGST_REKENING[k]], `Kassa ${rij.datum} ontvangen ${ONTVANGST_NAAM[k]}`, rij.ontvangen[k], "debet");
  boek(g.omzet21, `Kassa ${rij.datum} omzet 21%`, rij.btw[21].exclCent, "credit");
  boek(g.omzet9, `Kassa ${rij.datum} omzet 9%`, rij.btw[9].exclCent, "credit");
  boek(g.omzet0, `Kassa ${rij.datum} omzet 0%`, rij.btw[0].exclCent, "credit");
  boek(g.btw21, `Kassa ${rij.datum} btw 21%`, rij.btw[21].btwCent, "credit");
  boek(g.btw9, `Kassa ${rij.datum} btw 9%`, rij.btw[9].btwCent, "credit");
  boek(g.fooi, `Kassa ${rij.datum} fooi`, rij.fooiCent, "credit");
  return uit;
}

/** Het journaal van een periode als CSV (puntkomma's, Nederlandse bedragen, opent in Excel): een regel per boekingsregel. */
export function journaalCsv(dagen: readonly DagstaatDag[], g: Grootboek): string {
  const bedrag = (c: number) => (c === 0 ? "" : (c / 100).toFixed(2).replace(".", ","));
  const regels = dagen.flatMap((d) => journaalRegels(dagstaatRij(d), g));
  const kop = ["Datum", "Dagboek", "Grootboekrekening", "Omschrijving", "Debet", "Credit"];
  const rijen = regels.map((r) => [r.datum, "MEMO", r.rekening, r.omschrijving, bedrag(r.debetCent), bedrag(r.creditCent)]);
  const veld = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return `﻿${[kop, ...rijen].map((r) => r.map(veld).join(";")).join("\r\n")}`;
}
