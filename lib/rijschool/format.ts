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

// --- adres en telefoon op de website ---------------------------------------------

const POSTCODE = /^(\d{4})\s*([A-Za-z]{2})$/;

/** "Brodestraat 10,9742TC" + "Groningen" → ["Brodestraat 10", "9742 TC Groningen"]. Zoals ingevoerd als het niet te herkennen is. */
export function adresRegels(adres: string, plaats: string): string[] {
  const delen = adres
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  const regels: string[] = [];
  let postcode = "";
  for (const d of delen) {
    const p = POSTCODE.exec(d);
    const pPlaats = /^(\d{4})\s*([A-Za-z]{2})\s+(.+)$/.exec(d);
    if (p) postcode = `${p[1]} ${p[2]!.toUpperCase()}`;
    else if (pPlaats) postcode = `${pPlaats[1]} ${pPlaats[2]!.toUpperCase()} ${pPlaats[3]}`;
    else regels.push(d);
  }
  const plaatsInAdres = plaats && delen.some((d) => d.toLowerCase().includes(plaats.toLowerCase()));
  const tweede = [postcode, plaatsInAdres ? "" : plaats].filter(Boolean).join(" ");
  return [...regels, ...(tweede ? [tweede] : [])];
}

/** "0634825780" → "06 34 82 57 80"; een vast nummer → "050 123 4567". Anders zoals ingevoerd. */
export function telefoonWeergave(telefoon: string): string {
  const c = telefoon.replace(/[^\d+]/g, "").replace(/^\+31/, "0").replace(/^0031/, "0");
  if (/^06\d{8}$/.test(c)) return `06 ${c.slice(2).replace(/(\d{2})(?=\d)/g, "$1 ")}`;
  if (/^0[1-9]\d{8}$/.test(c)) return `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6)}`;
  return telefoon.trim();
}

/** Voor een tel:-link: "0634825780" → "+31634825780". */
export function telefoonLink(telefoon: string): string {
  const c = telefoon.replace(/[^\d+]/g, "");
  if (/^0[1-9]\d{8}$/.test(c)) return `+31${c.slice(1)}`;
  if (c.startsWith("0031")) return `+${c.slice(2)}`;
  return c;
}
