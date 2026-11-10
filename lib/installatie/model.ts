import { schatTussenPunten } from "@/lib/geo/eigen-afstand";
import { amsterdamClock } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Een installatieafspraak met live volgen: de klant ziet wanneer de monteur komt, wanneer hij
// onderweg is, waar zijn ZekerFlex-bus op de kaart rijdt en hoe laat hij er ongeveer is. Dit
// bestand is puur (geen prisma, kv of env): de statussen, wat de klant te zien krijgt en de
// schatting van de aankomsttijd. De opslag staat in store.ts.
// ---------------------------------------------------------------------------

export const STATUSSEN = ["gepland", "onderweg", "aangekomen", "bezig", "klaar", "geannuleerd"] as const;
export type InstallatieStatus = (typeof STATUSSEN)[number];
export const isStatus = (s: unknown): s is InstallatieStatus => typeof s === "string" && (STATUSSEN as readonly string[]).includes(s);

export const STATUS_LABEL: Record<InstallatieStatus, string> = {
  gepland: "Gepland",
  onderweg: "De monteur is onderweg",
  aangekomen: "De monteur is er",
  bezig: "We installeren",
  klaar: "Klaar",
  geannuleerd: "Geannuleerd",
};

/** Waar de monteur naartoe mag vanuit een status. Alleen vooruit, behalve terug naar "gepland" als hij toch niet vertrekt. */
const MAG: Record<InstallatieStatus, InstallatieStatus[]> = {
  gepland: ["onderweg", "geannuleerd"],
  onderweg: ["aangekomen", "gepland", "geannuleerd"],
  aangekomen: ["bezig", "geannuleerd"],
  bezig: ["klaar"],
  klaar: [],
  geannuleerd: [],
};

export const magNaar = (van: InstallatieStatus, naar: InstallatieStatus): boolean => MAG[van].includes(naar);
export const volgendeStatussen = (van: InstallatieStatus): InstallatieStatus[] => MAG[van];

export interface Positie {
  lat: number;
  lon: number;
  /** ISO-tijd van de meting */
  at: string;
  /** in meters, zoals de telefoon het meldt */
  nauwkeurigheid?: number;
}

export interface Afspraak {
  id: string;
  klantNaam: string;
  /** straat en huisnummer */
  adres: string;
  plaats: string;
  lat: number;
  lon: number;
  /** het tijdvak dat de klant te horen kreeg, ISO-tijden */
  venster: { van: string; tot: string };
  /** de volledige naam; de klant ziet alleen de voornaam */
  monteurNaam: string;
  /** wat er wordt aangesloten, in gewone woorden */
  regels: string[];
  notitie: string;
  status: InstallatieStatus;
  /** alleen zolang de monteur onderweg is; daarna weg */
  positie: Positie | null;
  tijden: Partial<Record<InstallatieStatus, string>>;
  gemaakt: string;
}

/** Een positie ouder dan dit telt als "niet actueel": de telefoon heeft even geen bereik. */
export const POSITIE_OUD_SEC = 120;

export const positieOud = (p: Positie | null, nu: Date, grensSec = POSITIE_OUD_SEC): boolean => !p || nu.getTime() - Date.parse(p.at) > grensSec * 1000;

/** Aankomst in minuten vanaf een positie, met onze eigen schatting (lib/geo/eigen-afstand). */
export function etaMinuten(van: { lat: number; lon: number }, naar: { lat: number; lon: number }): number {
  return schatTussenPunten({ latitude: van.lat, longitude: van.lon }, { latitude: naar.lat, longitude: naar.lon }, "DRIVING").durationMinutes;
}

const voornaam = (naam: string) => naam.trim().split(/\s+/)[0] ?? "";

/** "dinsdag 12 november, tussen 13:00 en 15:00", in Nederlandse tijd. */
export function vensterTekst(v: { van: string; tot: string }): string {
  const dag = new Date(v.van).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "long", day: "numeric", month: "long" });
  return `${dag}, tussen ${amsterdamClock(v.van)} en ${amsterdamClock(v.tot)}`;
}

export interface Stap {
  key: InstallatieStatus;
  label: string;
  gedaan: boolean;
  actief: boolean;
  /** HH:MM waarop deze stap begon, in Nederlandse tijd */
  tijd: string | null;
}

const STAPPEN: InstallatieStatus[] = ["gepland", "onderweg", "aangekomen", "bezig", "klaar"];

export interface KlantBeeld {
  id: string;
  klantNaam: string;
  adres: string;
  plaats: string;
  venster: string;
  status: InstallatieStatus;
  statusLabel: string;
  stappen: Stap[];
  monteur: string;
  regels: string[];
  bestemming: { lat: number; lon: number };
  /** alleen onderweg en actueel; anders null */
  positie: { lat: number; lon: number; at: string } | null;
  /** de laatste meting is oud: de kaart toont dan de laatst bekende plek met een melding */
  positieOud: boolean;
  etaMinuten: number | null;
  etaTijd: string | null;
  tekst: string;
  bijgewerkt: string;
}

/** Wat de klant te zien krijgt: nooit het adres van de monteur, zijn achternaam of oude plekken. */
export function maakKlantBeeld(a: Afspraak, nu: Date): KlantBeeld {
  const onderweg = a.status === "onderweg";
  const pos = onderweg ? a.positie : null;
  const oud = onderweg ? positieOud(pos, nu) : false;
  const eta = pos ? etaMinuten(pos, a) : null;
  const etaTijd = eta === null || oud ? null : amsterdamClock(new Date(nu.getTime() + eta * 60_000));
  const actieveIndex = STAPPEN.indexOf(a.status);

  let tekst: string;
  switch (a.status) {
    case "gepland":
      tekst = `Afgesproken: ${vensterTekst(a.venster)}. Zodra ${voornaam(a.monteurNaam)} vertrekt, zie je hem hier rijden.`;
      break;
    case "onderweg":
      tekst = eta !== null && !oud
        ? `${voornaam(a.monteurNaam)} is onderweg. Hij is er over ongeveer ${eta} ${eta === 1 ? "minuut" : "minuten"}, rond ${etaTijd}.`
        : `${voornaam(a.monteurNaam)} is onderweg. We wachten even op zijn nieuwe positie.`;
      break;
    case "aangekomen":
      tekst = `${voornaam(a.monteurNaam)} is er. Hij begint zo met het installeren.`;
      break;
    case "bezig":
      tekst = "We installeren en testen alles. Dit duurt meestal een paar uur.";
      break;
    case "klaar":
      tekst = "Alles staat klaar en is getest. Bedankt, en veel plezier met je nieuwe systeem.";
      break;
    default:
      tekst = "Deze afspraak is geannuleerd. We nemen contact met je op voor een nieuwe afspraak.";
  }

  return {
    id: a.id,
    klantNaam: a.klantNaam,
    adres: a.adres,
    plaats: a.plaats,
    venster: vensterTekst(a.venster),
    status: a.status,
    statusLabel: STATUS_LABEL[a.status],
    stappen: STAPPEN.map((key, i) => ({
      key,
      label: STATUS_LABEL[key],
      gedaan: a.status !== "geannuleerd" && i < actieveIndex,
      actief: a.status !== "geannuleerd" && i === actieveIndex,
      tijd: a.tijden[key] ? amsterdamClock(a.tijden[key] as string) : null,
    })),
    monteur: voornaam(a.monteurNaam),
    regels: a.regels,
    bestemming: { lat: a.lat, lon: a.lon },
    positie: pos ? { lat: pos.lat, lon: pos.lon, at: pos.at } : null,
    positieOud: oud,
    etaMinuten: oud ? null : eta,
    etaTijd,
    tekst,
    bijgewerkt: nu.toISOString(),
  };
}

/** De richting (graden, 0 = noord) van het ene punt naar het andere: om de bus de goede kant op te laten wijzen. */
export function richting(van: { lat: number; lon: number }, naar: { lat: number; lon: number }): number {
  const r = (g: number) => (g * Math.PI) / 180;
  const y = Math.sin(r(naar.lon - van.lon)) * Math.cos(r(naar.lat));
  const x = Math.cos(r(van.lat)) * Math.sin(r(naar.lat)) - Math.sin(r(van.lat)) * Math.cos(r(naar.lat)) * Math.cos(r(naar.lon - van.lon));
  return (Math.round((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Een geldige plek op aarde en niet de oorsprong (0, 0): sommige telefoons melden dat als ze nog niets weten. */
export function geldigePositie(lat: unknown, lon: unknown): boolean {
  return typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
}
