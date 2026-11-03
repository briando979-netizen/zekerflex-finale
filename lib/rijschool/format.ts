import { amsterdamClock } from "@/lib/time/amsterdam";

// Datums en tijden van lessen, altijd in Nederlandse tijd: de server draait in
// UTC en een telefoon kan in een andere zone staan. Client-veilig.

const LANG = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "long", day: "numeric", month: "long" });
const KORT = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "short" });

/** Eerste letter een hoofdletter, de rest niet ("Dinsdag 4 november", niet "Dinsdag 4 November"). */
export const metHoofdletter = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "dinsdag 4 november" */
export const datumLang = (d: Date | string) => LANG.format(new Date(d));

/** "di 4 nov" */
export const datumKort = (d: Date | string) => KORT.format(new Date(d));

/** "10:00" */
export const tijd = (d: Date | string) => amsterdamClock(d);

/** "dinsdag 4 november, 10:00 – 11:00" */
export const lesMoment = (start: Date | string, eind: Date | string) => `${datumLang(start)}, ${tijd(start)} – ${tijd(eind)}`;

export const SOORT_LABEL: Record<string, string> = {
  LES: "Rijles",
  PROEFLES: "Proefles",
  TOETS: "Tussentijdse toets",
  EXAMEN: "Praktijkexamen",
};

export const STATUS_LABEL: Record<string, string> = {
  GEPLAND: "Gepland",
  VOLTOOID: "Gereden",
  GEANNULEERD: "Geannuleerd",
  NIET_VERSCHENEN: "Niet verschenen",
};

export const LEERLING_STATUS_LABEL: Record<string, string> = {
  AANMELDING: "Nieuwe aanmelding",
  ACTIEF: "Actief",
  GESLAAGD: "Geslaagd",
  GESTOPT: "Gestopt",
};

export const METHODE_LABEL: Record<string, string> = {
  IDEAL: "iDEAL",
  PIN: "Pin",
  CONTANT: "Contant",
  OVERBOEKING: "Overboeking",
};
