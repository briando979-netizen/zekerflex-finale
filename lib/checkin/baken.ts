import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { kvGet, kvGetMany, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Locatiebakens per vestiging: een geprinte QR-code en/of een Bluetooth-baken
// op de werkplek. Scant of vindt de kracht het baken, dan is dat extra bewijs
// bij de gps-check-in (lib/timesheets/checkin.ts blijft de bron van de uren).
//   - instellingen in KV locatie-baken:<branchId> (geen migratie);
//   - de QR-code bevat een token = HMAC(AUTH_SECRET, branchId + versie): niet te
//     raden, en met "nieuwe code" ongeldig te maken zonder de vestiging te wijzigen;
//   - het bewijs per urenbriefje in KV baken-bewijs:<timesheetId>.
// Nooit een token in een log: alleen branchId en de bron.
// ---------------------------------------------------------------------------

export interface BakenInstellingen {
  /** QR-code aan: de poster is te printen op /werkgever/locaties/<id>/baken */
  qr: boolean;
  /** versie van de QR-code; verhogen = oude posters ongeldig */
  qrVersie: number;
  /** naam waarmee het Bluetooth-baken zich meldt (bijv. ZF-BAKEN-1); leeg = geen baken */
  bleNaam: string | null;
  /** automatisch in- en uitchecken op de geofence aanbieden aan krachten */
  automatisch: boolean;
  updatedAt: string;
}

export type BakenBron = "qr" | "ble";

export interface BakenBewijs {
  timesheetId: string;
  gebeurtenissen: { type: "CHECK_IN" | "CHECK_OUT"; bron: BakenBron; at: string; naam?: string }[];
}

const KEY = (branchId: string) => `locatie-baken:${branchId}`;
const BEWIJS = (timesheetId: string) => `baken-bewijs:${timesheetId}`;

export const STANDAARD_BAKEN: BakenInstellingen = { qr: false, qrVersie: 1, bleNaam: null, automatisch: true, updatedAt: "" };

export async function bakenInstellingen(branchId: string): Promise<BakenInstellingen> {
  return { ...STANDAARD_BAKEN, ...((await kvGet<Partial<BakenInstellingen>>(KEY(branchId))) ?? {}) };
}

export async function bewaarBakenInstellingen(branchId: string, patch: Partial<Pick<BakenInstellingen, "qr" | "bleNaam" | "automatisch">> & { nieuweQr?: boolean }): Promise<BakenInstellingen> {
  const cur = await bakenInstellingen(branchId);
  const next: BakenInstellingen = {
    ...cur,
    ...(patch.qr !== undefined ? { qr: patch.qr } : {}),
    ...(patch.automatisch !== undefined ? { automatisch: patch.automatisch } : {}),
    ...(patch.bleNaam !== undefined ? { bleNaam: patch.bleNaam?.trim() ? patch.bleNaam.trim().slice(0, 40) : null } : {}),
    ...(patch.nieuweQr ? { qrVersie: cur.qrVersie + 1 } : {}),
    updatedAt: new Date().toISOString(),
  };
  await kvSet(KEY(branchId), next);
  return next;
}

/** Het token in de QR-code van een vestiging (24 hex-tekens). */
export function bakenToken(branchId: string, versie: number, secret = env.AUTH_SECRET): string {
  return createHmac("sha256", secret).update(`baken:${branchId}:${versie}`).digest("hex").slice(0, 24);
}

export function bakenTokenGeldig(branchId: string, versie: number, token: string, secret = env.AUTH_SECRET): boolean {
  const verwacht = Buffer.from(bakenToken(branchId, versie, secret));
  const gekregen = Buffer.from(token.trim().toLowerCase());
  return verwacht.length === gekregen.length && timingSafeEqual(verwacht, gekregen);
}

/** De link in de QR-code: opent de app, die dan incheckt op de klus van vandaag bij deze vestiging. */
export function bakenUrl(branchId: string, versie: number): string {
  return `${env.APP_BASE_URL.replace(/\/+$/, "")}/dashboard/inchecken?b=${encodeURIComponent(branchId)}&t=${bakenToken(branchId, versie)}`;
}

export async function bakenBewijs(timesheetId: string): Promise<BakenBewijs | null> {
  return kvGet<BakenBewijs>(BEWIJS(timesheetId));
}

export async function bakenBewijzen(timesheetIds: string[]): Promise<Map<string, BakenBewijs>> {
  const rows = await kvGetMany<BakenBewijs>(timesheetIds.map(BEWIJS));
  return new Map(timesheetIds.flatMap((id) => (rows.get(BEWIJS(id)) ? [[id, rows.get(BEWIJS(id))!] as const] : [])));
}

export async function bewaarBakenBewijs(timesheetId: string, g: BakenBewijs["gebeurtenissen"][number]): Promise<BakenBewijs> {
  const cur = (await bakenBewijs(timesheetId)) ?? { timesheetId, gebeurtenissen: [] };
  const next: BakenBewijs = { timesheetId, gebeurtenissen: [...cur.gebeurtenissen, g].slice(-10) };
  await kvSet(BEWIJS(timesheetId), next);
  return next;
}

/** Korte tekst voor een badge op de urenpagina: "QR" / "baken" / beide. */
export function bewijsLabel(b: BakenBewijs | undefined): string | null {
  if (!b || b.gebeurtenissen.length === 0) return null;
  const bronnen = [...new Set(b.gebeurtenissen.map((g) => g.bron))];
  return bronnen.map((x) => (x === "qr" ? "QR-code gescand" : "Bluetooth-baken")).join(" + ");
}
