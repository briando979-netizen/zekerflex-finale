import { amsterdamDayKey } from "@/lib/time/amsterdam";
import type { BestelRegel, BestelStatus } from "@/lib/horeca/bestellen";
import { faseVan, klaarOmTeServeren, stationFase, type Filter } from "@/lib/horeca/fasen";
import { minuten } from "@/lib/horeca/reserveren";

// ---------------------------------------------------------------------------
// De zaak op dit moment: per tafel wat er speelt (vrij, gereserveerd, bezet,
// wacht lang, klaar om te serveren, rekening open), de kerncijfers van vandaag
// en de lijstjes die schermen nodig hebben (alles-tegelijk voor de keuken,
// nummers voor het afhaalscherm). Puur: het dashboard, de handheld en de
// schermen rekenen allemaal met dezelfde regels.
// ---------------------------------------------------------------------------

/** Vanaf zoveel minuten wachten valt een bestelling op (amber). */
export const LET_OP_MIN = 15;
/** Vanaf zoveel minuten is het te lang (rood). */
export const TE_LANG_MIN = 25;
/** Een tafel staat zoveel minuten vóór een reservering al op "gereserveerd". */
export const VOORUIT_MIN = 90;
/** Een gast die niet komt, houdt de tafel zo lang na de tijd nog vast. */
export const LAAT_MIN = 30;

export type TafelStaat = "vrij" | "gereserveerd" | "bezet" | "wacht" | "serveren" | "rekening";

export const STAAT_LABEL: Record<TafelStaat, string> = {
  vrij: "Vrij",
  gereserveerd: "Gereserveerd",
  bezet: "Bezet",
  wacht: "Wacht lang",
  serveren: "Klaar om te serveren",
  rekening: "Rekening open",
};

/** Volgorde op het scherm: wat actie vraagt eerst. */
export const STAAT_VOLGORDE: TafelStaat[] = ["serveren", "wacht", "rekening", "bezet", "gereserveerd", "vrij"];

export interface LiveTafel {
  id: string;
  naam: string;
  plaatsen: number;
  zone: string;
  actief: boolean;
}

export interface LiveBestelling {
  id: string;
  nummer: number;
  tafelId: string | null;
  status: BestelStatus;
  regels: BestelRegel[];
  totaalCent: number;
  betaald: boolean;
  createdAt: string;
}

export interface LiveReservering {
  id: string;
  tafelId: string | null;
  tijd: string;
  personen: number;
  naam: string;
  status: "BEVESTIGD" | "AANGEKOMEN" | "NIET_GEKOMEN" | "GEANNULEERD";
}

export type OproepSoort = "ober" | "rekening";

export interface LiveOproep {
  tafelId: string;
  soort: OproepSoort;
  op: string;
}

export interface TafelLive {
  id: string;
  naam: string;
  zone: string;
  plaatsen: number;
  staat: TafelStaat;
  /** onbetaald, zonder geannuleerde bestellingen */
  openCent: number;
  /** bestellingen die nog niet helemaal geserveerd zijn */
  openBestellingen: number;
  /** de langst wachtende bestelling die nog niet klaar is, in minuten */
  wachtMin: number | null;
  /** stuks die klaarstaan om te serveren */
  serveren: number;
  /** minuten sinds de eerste onbetaalde bestelling */
  sindsMin: number | null;
  reservering: { id: string; tijd: string; naam: string; personen: number; status: LiveReservering["status"] } | null;
  oproep: OproepSoort | null;
}

const minSinds = (iso: string, nuMs: number) => Math.max(0, Math.floor((nuMs - Date.parse(iso)) / 60_000));
const telt = (b: Pick<LiveBestelling, "status">) => b.status !== "GEANNULEERD";
const wachtend = (b: Pick<LiveBestelling, "status">) => b.status === "NIEUW" || b.status === "IN_BEREIDING";

/** De reservering die nu bij de tafel hoort: wie er zit, anders wie eraan komt. */
function reserveringBij(tafelId: string, res: readonly LiveReservering[], nuMin: number, verblijfMin: number): LiveReservering | null {
  const eigen = res.filter((r) => r.tafelId === tafelId);
  const zit = eigen.find((r) => r.status === "AANGEKOMEN" && nuMin >= minuten(r.tijd) - VOORUIT_MIN && nuMin < minuten(r.tijd) + verblijfMin);
  if (zit) return zit;
  return (
    eigen
      .filter((r) => r.status === "BEVESTIGD" && nuMin >= minuten(r.tijd) - VOORUIT_MIN && nuMin <= minuten(r.tijd) + LAAT_MIN)
      .sort((a, b) => minuten(a.tijd) - minuten(b.tijd))[0] ?? null
  );
}

export function zaalLive(i: {
  tafels: readonly LiveTafel[];
  bestellingen: readonly LiveBestelling[];
  reserveringen: readonly LiveReservering[];
  oproepen: readonly LiveOproep[];
  nuMs: number;
  nuMin: number;
  verblijfMin: number;
}): TafelLive[] {
  return i.tafels
    .filter((t) => t.actief)
    .map((t) => {
      const onbetaald = i.bestellingen.filter((b) => b.tafelId === t.id && !b.betaald && telt(b));
      const open = onbetaald.filter((b) => b.status !== "GESERVEERD");
      const wacht = open.filter(wachtend).map((b) => minSinds(b.createdAt, i.nuMs));
      const wachtMin = wacht.length ? Math.max(...wacht) : null;
      const serveren = onbetaald.reduce((s, b) => s + klaarOmTeServeren(b.regels), 0);
      const eerste = onbetaald.map((b) => b.createdAt).sort()[0];
      const res = reserveringBij(t.id, i.reserveringen, i.nuMin, i.verblijfMin);
      const oproepen = i.oproepen.filter((o) => o.tafelId === t.id);
      const staat: TafelStaat = onbetaald.length
        ? serveren > 0
          ? "serveren"
          : wachtMin !== null && wachtMin >= LET_OP_MIN
            ? "wacht"
            : open.length
              ? "bezet"
              : "rekening"
        : res?.status === "AANGEKOMEN"
          ? "bezet"
          : res
            ? "gereserveerd"
            : "vrij";
      return {
        id: t.id,
        naam: t.naam,
        zone: t.zone,
        plaatsen: t.plaatsen,
        staat,
        openCent: onbetaald.reduce((s, b) => s + b.totaalCent, 0),
        openBestellingen: open.length,
        wachtMin,
        serveren,
        sindsMin: eerste ? minSinds(eerste, i.nuMs) : null,
        reservering: res ? { id: res.id, tijd: res.tijd, naam: res.naam, personen: res.personen, status: res.status } : null,
        // de rekening vragen weegt zwaarder dan de ober roepen
        oproep: oproepen.some((o) => o.soort === "rekening") ? "rekening" : oproepen.length ? "ober" : null,
      };
    });
}

/** Tafels in de volgorde van wat aandacht vraagt (oproep eerst), daarna op naam. */
export const opAandacht = (tafels: readonly TafelLive[]) =>
  [...tafels].sort(
    (a, b) =>
      Number(Boolean(b.oproep)) - Number(Boolean(a.oproep)) ||
      STAAT_VOLGORDE.indexOf(a.staat) - STAAT_VOLGORDE.indexOf(b.staat) ||
      a.naam.localeCompare(b.naam, "nl", { numeric: true }),
  );

export interface LiveCijfers {
  omzetCent: number;
  bestellingen: number;
  inBereiding: number;
  klaar: number;
  langsteWachtMin: number | null;
  /** mediaan van bestellen tot klaar, vandaag */
  bereidingMin: number | null;
  reserveringen: number;
  gastenVerwacht: number;
  gastenBinnen: number;
  gastenNogTeKomen: number;
  noShows: number;
  tafelsBezet: number;
  tafelsActief: number;
  openRekeningCent: number;
}

const mediaan = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : Math.round(((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2);
};

export function liveCijfers(i: {
  bestellingen: readonly LiveBestelling[];
  reserveringen: readonly LiveReservering[];
  zaal: readonly TafelLive[];
  vandaag: string;
  nuMs: number;
}): LiveCijfers {
  const vandaag = i.bestellingen.filter((b) => telt(b) && amsterdamDayKey(b.createdAt) === i.vandaag);
  const wachten = i.bestellingen.filter(wachtend);
  const bereiding = vandaag.flatMap((b) => {
    const klaar = b.regels.map((r) => r.klaarOp).filter((x): x is string => typeof x === "string");
    if (!klaar.length || klaar.length < b.regels.length) return [];
    return [Math.max(0, Math.round((Math.max(...klaar.map((k) => Date.parse(k))) - Date.parse(b.createdAt)) / 60_000))];
  });
  const res = i.reserveringen.filter((r) => r.status !== "GEANNULEERD");
  const som = (xs: readonly LiveReservering[]) => xs.reduce((s, r) => s + r.personen, 0);
  return {
    omzetCent: vandaag.reduce((s, b) => s + b.totaalCent, 0),
    bestellingen: vandaag.length,
    inBereiding: wachten.length,
    klaar: i.bestellingen.filter((b) => b.status === "KLAAR").length,
    langsteWachtMin: wachten.length ? Math.max(...wachten.map((b) => minSinds(b.createdAt, i.nuMs))) : null,
    bereidingMin: mediaan(bereiding),
    reserveringen: res.filter((r) => r.status !== "NIET_GEKOMEN").length,
    gastenVerwacht: som(res.filter((r) => r.status !== "NIET_GEKOMEN")),
    gastenBinnen: som(res.filter((r) => r.status === "AANGEKOMEN")),
    gastenNogTeKomen: som(res.filter((r) => r.status === "BEVESTIGD")),
    noShows: som(res.filter((r) => r.status === "NIET_GEKOMEN")),
    tafelsBezet: i.zaal.filter((t) => t.staat !== "vrij" && t.staat !== "gereserveerd").length,
    tafelsActief: i.zaal.length,
    openRekeningCent: i.zaal.reduce((s, t) => s + t.openCent, 0),
  };
}

/** De reserveringen die nog komen (of net te laat zijn), op tijd. */
export const nogTeKomen = (res: readonly LiveReservering[], nuMin: number, max = 8) =>
  res
    .filter((r) => r.status === "BEVESTIGD" && minuten(r.tijd) >= nuMin - LAAT_MIN)
    .sort((a, b) => minuten(a.tijd) - minuten(b.tijd))
    .slice(0, max);

/** Alles-tegelijk voor keuken of bar: hoeveel van elk gerecht er nog gemaakt moet worden. */
export function allesTegelijk(bestellingen: readonly LiveBestelling[], filter: Filter): { naam: string; aantal: number }[] {
  const per = new Map<string, number>();
  for (const b of bestellingen) {
    if (!telt(b)) continue;
    for (const r of b.regels) {
      if (filter !== "alles" && r.station !== filter) continue;
      const f = faseVan(r);
      if (f === "nieuw" || f === "gestart") per.set(r.naam, (per.get(r.naam) ?? 0) + r.aantal);
    }
  }
  return [...per.entries()].map(([naam, aantal]) => ({ naam, aantal })).sort((a, b) => b.aantal - a.aantal || a.naam.localeCompare(b.naam, "nl"));
}

/**
 * De bonnen voor een station: alles wat het station nog moet maken, oudste
 * eerst. Bestellingen zonder regels voor dit station vallen weg.
 */
export const bonnenVoor = <B extends LiveBestelling>(bestellingen: readonly B[], filter: Filter) =>
  bestellingen
    .filter((b) => telt(b))
    .map((b) => ({ b, fase: stationFase(b.regels, filter) }))
    .filter((x): x is { b: B; fase: "nieuw" | "gestart" } => x.fase === "nieuw" || x.fase === "gestart")
    .sort((x, y) => x.b.createdAt.localeCompare(y.b.createdAt));

/** Wat het station het laatst klaar meldde (om per ongeluk afgemelde bonnen terug te halen). */
export const recentKlaar = <B extends LiveBestelling>(bestellingen: readonly B[], filter: Filter, max = 6): B[] =>
  bestellingen
    .filter((b) => telt(b) && stationFase(b.regels, filter) === "klaar")
    .sort((x, y) => laatsteKlaar(y.regels, filter).localeCompare(laatsteKlaar(x.regels, filter)))
    .slice(0, max);

const laatsteKlaar = (regels: readonly BestelRegel[], filter: Filter) =>
  regels
    .filter((r) => filter === "alles" || r.station === filter)
    .map((r) => r.klaarOp ?? "")
    .sort()
    .pop() ?? "";

/** Het afhaalscherm: nummers van bestellingen zonder tafel (balie, afhalen, bar). */
export function afhaalNummers(bestellingen: readonly LiveBestelling[], nuMs: number): { bereiding: number[]; klaar: number[] } {
  const zonderTafel = bestellingen.filter((b) => b.tafelId === null && telt(b));
  return {
    bereiding: zonderTafel.filter(wachtend).map((b) => b.nummer).sort((a, b) => a - b),
    // klaar en nog niet opgehaald; na drie uur valt hij er vanzelf af
    klaar: zonderTafel
      .filter((b) => b.status === "KLAAR" && nuMs - Date.parse(b.createdAt) < 3 * 3600_000)
      .map((b) => b.nummer)
      .sort((a, b) => a - b),
  };
}
