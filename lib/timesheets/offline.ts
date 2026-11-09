// ---------------------------------------------------------------------------
// Inchecken en uitchecken zonder bereik: de regels voor het tijdstip.
//
// Een werker in een kelder, koelcel of op een festivalterrein tikt op
// Inchecken/Uitchecken zonder bereik. De telefoon bewaart de tik (tijdstip +
// GPS-plek van dat moment, lib/checkin/wachtrij.ts) en verstuurt hem zodra er
// weer bereik is, met bron "offline". De server neemt dat tijdstip alleen
// over binnen strakke grenzen; daarbuiten weigert hij (geen ontvangsttijd in
// de plaats: een uitcheck die uren later binnenkomt zou dan uren te veel
// geven, een incheck uren te weinig). Een geweigerde tik vult de werker zelf
// in bij zijn uren; de opdrachtgever ziet dan "geen GPS-check-in".
//
// Ook de gewone, direct verstuurde tik krijgt een grens: de klok van de
// telefoon telt alleen binnen twee minuten vóór de ontvangst, anders de
// servertijd. Zo kan niemand een tijd stil terugzetten zonder bron "offline"
// (en dus zonder signaal voor de opdrachtgever, lib/fraud/timesheet.ts).
//
// Puur bestand: de server (lib/timesheets/checkin.ts) en de knop in de app
// (components/app/CheckInPanel.tsx) delen dezelfde grenzen.
// ---------------------------------------------------------------------------

const MIN = 60_000;
const UUR = 60 * MIN;

/** Direct verstuurd: zoveel mag de klok van de telefoon vóór de ontvangst liggen. */
export const LIVE_MARGE_MS = 2 * MIN;
/** Een bewaarde tik die ouder is dan dit, neemt de server niet meer over. */
export const BEWAARD_MAX_MS = 12 * UUR;
/** Inchecken kan vanaf een uur vóór de geplande start (zelfde venster als de knop). */
export const INCHECK_VOOR_MS = 1 * UUR;
/** ...en tot zes uur na het geplande einde. */
export const UITCHECK_NA_MS = 6 * UUR;

export type OfflineReden = "toekomst" | "teOud" | "voorDienst" | "naDienst" | "voorInchecken" | "klok";

/** De melding van de server (Nederlands); de app toont de vertaling via `details.reden`. */
export const OFFLINE_MELDING: Record<OfflineReden, string> = {
  toekomst: "Het tijdstip ligt na het moment van versturen.",
  teOud: "Deze registratie is langer dan 12 uur geleden. Vul je tijden in bij je uren.",
  voorDienst: "Het tijdstip ligt meer dan een uur vóór het begin van de dienst.",
  naDienst: "Het tijdstip ligt meer dan zes uur na het einde van de dienst.",
  voorInchecken: "Het uitchecken ligt vóór het inchecken.",
  klok: "De klok van je telefoon klopt niet: het versturen lag vóór het tikken.",
};

/** Direct verstuurd: de tijd van de telefoon als die binnen twee minuten vóór nu ligt, anders nu. */
export function liveTijdstip(client: Date | undefined, nu: Date): Date {
  if (!client || Number.isNaN(client.getTime())) return nu;
  const verschil = nu.getTime() - client.getTime();
  return verschil >= 0 && verschil <= LIVE_MARGE_MS ? client : nu;
}

/**
 * Het moment van tikken volgens de server. Met `verzondenOp` (de klok van de telefoon bij het
 * versturen) telt alleen de verstreken tijd volgens de telefoon: ontvangst min (verzonden − getikt).
 * Een klok die voor- of achterloopt verschuift het tijdstip dan niet, en het ligt nooit na de
 * ontvangst. Verzonden vóór getikt kan niet: "klok".
 */
export function offlineTijdstip(i: { tikOp: Date; verzondenOp?: Date | undefined; nu: Date }): Date | "klok" {
  if (!i.verzondenOp || Number.isNaN(i.verzondenOp.getTime())) return i.tikOp;
  const verstreken = i.verzondenOp.getTime() - i.tikOp.getTime();
  if (verstreken < 0) return "klok";
  return new Date(i.nu.getTime() - verstreken);
}

export interface OfflineInvoer {
  type: "CHECK_IN" | "CHECK_OUT";
  /** het moment van tikken (na offlineTijdstip) */
  tik: Date;
  /** ontvangst op de server */
  nu: Date;
  geplandeStart: Date;
  geplandEinde: Date;
  /** wanneer de werker is ingecheckt (bij uitchecken) */
  ingechecktOp: Date | null;
}

/** Binnen [gepland begin − een uur, ontvangst], hoogstens 12 uur oud, en uitchecken niet vóór inchecken. */
export function beoordeelOffline(i: OfflineInvoer): { ok: true } | { ok: false; reden: OfflineReden } {
  const t = i.tik.getTime();
  if (Number.isNaN(t)) return { ok: false, reden: "klok" };
  if (t > i.nu.getTime()) return { ok: false, reden: "toekomst" };
  if (i.nu.getTime() - t > BEWAARD_MAX_MS) return { ok: false, reden: "teOud" };
  if (t < i.geplandeStart.getTime() - INCHECK_VOOR_MS) return { ok: false, reden: "voorDienst" };
  if (t > i.geplandEinde.getTime() + UITCHECK_NA_MS) return { ok: false, reden: "naDienst" };
  if (i.type === "CHECK_OUT" && i.ingechecktOp && t < i.ingechecktOp.getTime()) return { ok: false, reden: "voorInchecken" };
  return { ok: true };
}
