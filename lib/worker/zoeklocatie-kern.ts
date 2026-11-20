// De plaats waar een werker klussen wil doen, gekozen op het startscherm "Waar wil je klussen doen?" (naar de app van
// YoungOnes, 20 nov 2026). Puur bestand: het scherm (client) en de opslag (lib/worker/zoeklocatie.ts) lezen allebei
// deze vorm en controle. Het is geen thuisbasis: die komt met de postcode bij Je gegevens; tot die er is, gebruikt de
// klussenlijst deze plaats voor "bij jou in de buurt".

export interface Zoeklocatie {
  lat: number;
  lng: number;
  /** de naam die de werker ziet ("Amsterdam", "Huidige locatie") */
  label: string;
}

const LABEL_MAX = 120;

/** Ruwweg Nederland (met wat rand): een plaats buiten dit vlak is geen zoeklocatie. */
export function binnenNederland(lat: number, lng: number): boolean {
  return lat >= 50.5 && lat <= 53.8 && lng >= 3.0 && lng <= 7.4;
}

/** Maakt van ongecontroleerde invoer een nette zoeklocatie, of null als er niets bruikbaars in zit. */
export function maakZoeklocatie(invoer: unknown): Zoeklocatie | null {
  if (!invoer || typeof invoer !== "object") return null;
  const { lat, lng, label } = invoer as { lat?: unknown; lng?: unknown; label?: unknown };
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!binnenNederland(lat, lng)) return null;
  const naam = typeof label === "string" ? label.trim().slice(0, LABEL_MAX) : "";
  if (!naam) return null;
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, label: naam };
}
