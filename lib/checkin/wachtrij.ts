// ---------------------------------------------------------------------------
// Inchecken zonder bereik, de kant van de telefoon: een in- of uitcheck die
// niet aankomt (geen netwerk, netwerkfout, server even weg) bewaart de app op
// het toestel, met het tijdstip van tikken en de GPS-plek van dat moment, en
// verstuurt hem later vanzelf (components/app/BewaardeTikken.tsx), in volgorde
// en met een eigen id per tik: twee keer versturen telt op de server één keer
// (lib/timesheets/checkin.ts). Een gewone weigering (4xx) wordt niet bewaard.
//
// Per gebruiker een eigen sleutel in localStorage, gewist bij uitloggen
// (components/app/UitloggenFormulier.tsx). Elke toegang tot de opslag staat
// in try/catch: in een privévenster of zonder opslag werkt de knop gewoon
// zoals vroeger. Geen prisma/zod hier: dit draait in de browser.
// ---------------------------------------------------------------------------

export interface BewaardeTik {
  /** eigen id van deze tik (crypto.randomUUID), gaat mee als clientId */
  id: string;
  timesheetId: string;
  type: "CHECK_IN" | "CHECK_OUT";
  /** het moment van tikken, klok van de telefoon (ISO) */
  tikOp: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  deviceHash: string;
}

export const SLEUTEL_VOORVOEGSEL = "zf:bewaarde-tikken:";
/** Wat na een week nog op het toestel staat, ruimt de app op (de server neemt het na 12 uur niet meer). */
export const OPRUIMEN_NA_MS = 7 * 24 * 3_600_000;
/** Venster-gebeurtenis bij elke wijziging; `detail` is een WachtrijMelding. */
export const WACHTRIJ_GEBEURTENIS = "zf:bewaarde-tikken";

export const sleutelVoor = (userId: string) => `${SLEUTEL_VOORVOEGSEL}${userId}`;

export type Uitkomst = "aangekomen" | "opnieuw" | "geweigerd";

/**
 * Wat een antwoord betekent. Geen antwoord (netwerk), 5xx, 408, 425 en 429: later opnieuw.
 * 401 ook (de sessie verliep; na opnieuw inloggen gaat hij alsnog). Elke andere 4xx is een
 * gewone weigering van de server: niet bewaren, de werker ziet de reden.
 */
export function uitkomstVan(status: number | null): Uitkomst {
  if (status === null) return "opnieuw";
  if (status >= 200 && status < 300) return "aangekomen";
  if (status >= 500 || status === 401 || status === 408 || status === 425 || status === 429) return "opnieuw";
  return "geweigerd";
}

const isTik = (v: unknown): v is BewaardeTik => {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.timesheetId === "string" &&
    (t.type === "CHECK_IN" || t.type === "CHECK_OUT") &&
    typeof t.tikOp === "string" &&
    !Number.isNaN(Date.parse(t.tikOp)) &&
    typeof t.latitude === "number" &&
    typeof t.longitude === "number" &&
    typeof t.accuracyMeters === "number" &&
    typeof t.deviceHash === "string"
  );
};

/** De bewaarde lijst uit de opslag; alles wat er niet uitziet als een tik valt weg. */
export function leesTikken(raw: string | null): BewaardeTik[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(isTik) : [];
  } catch {
    return [];
  }
}

/** Op volgorde van tikken; bij hetzelfde moment eerst inchecken. */
export function opVolgorde(lijst: readonly BewaardeTik[]): BewaardeTik[] {
  return [...lijst].sort((a, b) => Date.parse(a.tikOp) - Date.parse(b.tikOp) || (a.type === b.type ? 0 : a.type === "CHECK_IN" ? -1 : 1));
}

/** Zonder de tikken die ouder zijn dan een week. */
export function opgeruimd(lijst: readonly BewaardeTik[], nu: number): BewaardeTik[] {
  return lijst.filter((t) => nu - Date.parse(t.tikOp) <= OPRUIMEN_NA_MS);
}

/** Wat naar /api/timesheets/<id>/gps gaat: bewaard op de telefoon, met de klok van nu erbij. */
export function verzendBody(t: BewaardeTik, verzondenOp: Date) {
  return {
    type: t.type,
    latitude: t.latitude,
    longitude: t.longitude,
    accuracyMeters: t.accuracyMeters,
    deviceHash: t.deviceHash,
    recordedAt: t.tikOp,
    clientId: t.id,
    offline: true,
    verzondenOp: verzondenOp.toISOString(),
  };
}

/** Een id per tik; crypto.randomUUID kan ontbreken (oude browser, geen https). */
export function nieuwId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // val terug op hieronder
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}

// --- opslag (browser) -------------------------------------------------------

function opslag(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function laadTikken(userId: string): BewaardeTik[] {
  try {
    return leesTikken(opslag()?.getItem(sleutelVoor(userId)) ?? null);
  } catch {
    return [];
  }
}

/** false als het niet lukte (privévenster, opslag vol): dan is de tik niet bewaard. */
export function bewaarTikken(userId: string, lijst: readonly BewaardeTik[]): boolean {
  const s = opslag();
  if (!s) return false;
  try {
    if (lijst.length === 0) s.removeItem(sleutelVoor(userId));
    else s.setItem(sleutelVoor(userId), JSON.stringify(lijst));
    return true;
  } catch {
    return false;
  }
}

/** Voeg één tik toe (en controleer dat hij echt is opgeslagen). */
export function bewaarTik(userId: string, tik: BewaardeTik): boolean {
  const lijst = laadTikken(userId).filter((t) => t.id !== tik.id);
  if (!bewaarTikken(userId, [...lijst, tik])) return false;
  return laadTikken(userId).some((t) => t.id === tik.id);
}

export function verwijderTik(userId: string, id: string): void {
  bewaarTikken(userId, laadTikken(userId).filter((t) => t.id !== id));
}

/** Wis de bewaarde tikken van iedereen (uitloggen), of van iedereen behalve `behalve`. */
export function wisTikken(behalve?: string): void {
  const s = opslag();
  if (!s) return;
  try {
    const weg: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(SLEUTEL_VOORVOEGSEL) && (behalve === undefined || k !== sleutelVoor(behalve))) weg.push(k);
    }
    for (const k of weg) s.removeItem(k);
  } catch {
    // geen opslag: niets te wissen
  }
}
