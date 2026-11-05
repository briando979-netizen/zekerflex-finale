import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Inchecken op locatie (4 nov 2026): een terminal (tablet of oude telefoon aan
// de muur) of een NFC-sticker bij de ingang. Een kracht checkt in door de
// QR-code op het scherm te scannen, de telefoon tegen de sticker te houden of
// een sleutelhanger tegen de tablet te houden. De uren gaan dan meteen in het
// urenbriefje (lib/timesheets/checkin.ts), op de plek van de vestiging zelf.
// Dit bestand: alleen rekenregels, zonder database. Opslag: lib/incheck/store.ts.
// ---------------------------------------------------------------------------

/** Letters en cijfers zonder verwisselbare tekens (geen 0/O, 1/I/L). */
const TEKENS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const sleutel = (): string => process.env.AUTH_SECRET ?? "dev-secret";

/** Een openbare terminalcode (op de sticker en in de QR): acht tekens, niet te raden. */
export function nieuweCode(): string {
  return [...randomBytes(8)].map((b) => TEKENS[b % TEKENS.length]).join("");
}

/** De geheime sleutel van het terminalscherm (in het adres van de tablet): nooit loggen. */
export const nieuweSleutel = (): string => randomBytes(24).toString("base64url");

/** De sleutel wordt alleen als hash bewaard. */
export const sleutelHash = (s: string): string => createHmac("sha256", sleutel()).update(`terminal-sleutel:${s}`).digest("base64url").slice(0, 32);

/** Het serienummer van een sleutelhanger wordt alleen als hash bewaard. */
export const fobHash = (serie: string): string => createHmac("sha256", sleutel()).update(`nfc-fob:${serie.toLowerCase().replace(/[^0-9a-f]/g, "")}`).digest("base64url").slice(0, 32);

export const isCode = (s: unknown): s is string => typeof s === "string" && /^[A-HJ-NP-Z2-9]{8}$/.test(s);

/** Hoe lang één code op het scherm geldig is. */
export const OTP_SECONDEN = 60;

/**
 * De code in de QR op het scherm wisselt elke minuut (zoals een authenticator-app), zodat een
 * foto van het scherm later niet meer werkt. Zes tekens uit een HMAC op terminal en tijdvak.
 */
export function otpVoor(terminalId: string, nu: number = Date.now(), vak = 0): string {
  const slot = Math.floor(nu / (OTP_SECONDEN * 1000)) + vak;
  const h = createHmac("sha256", sleutel()).update(`terminal-otp:${terminalId}:${slot}`).digest();
  let uit = "";
  for (let i = 0; i < 6; i++) uit += TEKENS[h[i]! % TEKENS.length];
  return uit;
}

/** Geldig = de code van dit of het vorige tijdvak (de gast scande net voor de wissel). */
export function otpGeldig(terminalId: string, otp: string, nu: number = Date.now()): boolean {
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(otp)) return false;
  return [0, -1].some((vak) => {
    const a = Buffer.from(otpVoor(terminalId, nu, vak));
    const b = Buffer.from(otp);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

/** Hoeveel seconden de code op het scherm nog geldig is. */
export const otpRest = (nu: number = Date.now()): number => OTP_SECONDEN - Math.floor((nu / 1000) % OTP_SECONDEN);

// --- welke dienst, en in of uit ---------------------------------------------------

export interface DienstVandaag {
  assignmentId: string;
  shiftId: string;
  titel: string;
  start: Date;
  eind: Date;
  timesheetId: string | null;
  timesheetStatus: string | null;
  ingecheckt: boolean;
  uitgecheckt: boolean;
}

/** Vanaf wanneer vóór de dienst, en tot hoe lang erna, inchecken bij de terminal kan. */
export const VOOR_MS = 2 * 3_600_000;
export const NA_MS = 6 * 3_600_000;

/**
 * De dienst waar het om gaat: eerst een dienst die nu loopt (of binnen twee uur begint) en nog
 * niet is uitgecheckt, anders de eerstvolgende. Geen dienst binnen het venster = null.
 */
export function kiesDienst(diensten: readonly DienstVandaag[], nu: number = Date.now()): DienstVandaag | null {
  const open = diensten.filter((d) => !d.uitgecheckt && nu >= d.start.getTime() - VOOR_MS && nu <= d.eind.getTime() + NA_MS);
  if (!open.length) return null;
  // eerst wie al ingecheckt is (uitchecken gaat voor), dan de vroegste
  return [...open].sort((a, b) => Number(b.ingecheckt) - Number(a.ingecheckt) || a.start.getTime() - b.start.getTime())[0] ?? null;
}

export type Actie = "in" | "uit";

/** Wat de volgende tik doet. */
export const volgendeActie = (d: Pick<DienstVandaag, "ingecheckt" | "uitgecheckt">): Actie | null => (d.uitgecheckt ? null : d.ingecheckt ? "uit" : "in");

/** "Welkom, Noa" / "Tot ziens, Noa": de voornaam uit de volledige naam. */
export const voornaam = (naam: string): string => naam.trim().split(/\s+/)[0] ?? naam;

/** Het serienummer uit wat Web NFC geeft ("04:a3:2b:…" of "04a32b…"); null als het niets is. */
export function leesSerie(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const hex = s.toLowerCase().replace(/[^0-9a-f]/g, "");
  return hex.length >= 8 && hex.length <= 40 ? hex : null;
}

/** Het paspoort-token uit de gescande QR van een werkpaspoort (…/paspoort/<token>), of de tekst zelf. */
export function leesPaspoortToken(gescand: string): string | null {
  const s = gescand.trim();
  const m = /\/paspoort\/([A-Za-z0-9_.-]{10,200})/.exec(s);
  const token = m ? m[1] : /^[A-Za-z0-9_.-]{10,200}$/.test(s) ? s : null;
  return token && token.includes(".") ? token : null;
}
