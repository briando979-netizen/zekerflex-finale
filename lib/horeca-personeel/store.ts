import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { leesPersoneel } from "@/lib/horeca-personeel/schema";
import {
  MAX_DASHBOARDS,
  MAX_MEDEWERKERS,
  UITNODIGING_DAGEN,
  dashboardVan,
  leegPersoneel,
  schoneBlokken,
  schoonEmail,
  volgendeId,
  type Mededeling,
  type Medewerker,
  type PersoneelData,
  type PersoneelsDashboard,
} from "@/lib/horeca-personeel/model";

// ---------------------------------------------------------------------------
// Het eigen personeel van een horecazaak, bewaard als één KV-waarde per bedrijf (horeca:personeel:<tenantId>, zie
// lib/privacy/org-kv.ts), plus per medewerkeraccount een verwijzing terug (horeca:medewerker:<userId>, zie
// lib/privacy/user-kv.ts). Geen eigen tabel: dat scheelt een migratie, en de aantallen zijn klein. Alle wijzigingen gaan
// door de functies hieronder, die steeds de hele waarde lezen, aanpassen en terugzetten.
// ---------------------------------------------------------------------------

export const PERSONEEL_PREFIX = "horeca:personeel:";
export const MEDEWERKER_PREFIX = "horeca:medewerker:";
const ISSUER = "zekerflex.horeca-personeel";

export interface MedewerkerVerwijzing {
  tenantId: string;
  medewerkerId: string;
}

export async function leesPersoneelVan(tenantId: string): Promise<PersoneelData> {
  const ruw = await kvGet<unknown>(`horeca:personeel:${tenantId}`);
  return (ruw === null ? null : leesPersoneel(ruw)) ?? leegPersoneel();
}

const bewaar = (tenantId: string, d: PersoneelData) => kvSet(`horeca:personeel:${tenantId}`, d);

export const verwijzingVan = (userId: string) => kvGet<MedewerkerVerwijzing>(`${MEDEWERKER_PREFIX}${userId}`);

// ---- dashboards ------------------------------------------------------------

export async function bewaarDashboard(tenantId: string, input: { id?: string | undefined; naam: string; blokken: string[] }): Promise<PersoneelData> {
  const d = await leesPersoneelVan(tenantId);
  const blokken = schoneBlokken(input.blokken);
  const naam = input.naam.trim();
  if (input.id) {
    const bestaand = dashboardVan(d, input.id);
    if (!bestaand) throw AppError.notFound("Dit dashboard bestaat niet meer.");
    d.dashboards = d.dashboards.map((x): PersoneelsDashboard => (x.id === input.id ? { ...x, naam, blokken } : x));
  } else {
    if (d.dashboards.length >= MAX_DASHBOARDS) throw AppError.validation("Je hebt het maximale aantal dashboards bereikt.");
    d.dashboards = [...d.dashboards, { id: volgendeId("d", d.dashboards), naam, blokken }];
  }
  await bewaar(tenantId, d);
  return d;
}

export async function verwijderDashboard(tenantId: string, id: string): Promise<PersoneelData> {
  const d = await leesPersoneelVan(tenantId);
  if (d.medewerkers.some((m) => m.dashboardId === id && m.status !== "gestopt")) {
    throw AppError.precondition("Er zijn nog medewerkers met dit dashboard. Geef die eerst een ander dashboard.");
  }
  d.dashboards = d.dashboards.filter((x) => x.id !== id);
  d.mededelingen = d.mededelingen.map((m) => ({ ...m, dashboardIds: m.dashboardIds.filter((x) => x !== id) }));
  await bewaar(tenantId, d);
  return d;
}

// ---- medewerkers -----------------------------------------------------------

function tokenSleutel(): Uint8Array {
  return new TextEncoder().encode(env.AUTH_SECRET);
}

export interface UitnodigingsToken {
  tenantId: string;
  tenantName: string;
  medewerkerId: string;
  email: string;
  naam: string;
}

async function maakToken(t: UitnodigingsToken): Promise<string> {
  return new SignJWT({ ...t })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(`${UITNODIGING_DAGEN}d`)
    .sign(tokenSleutel());
}

export async function leesUitnodigingsToken(token: string): Promise<UitnodigingsToken | null> {
  try {
    const { payload } = await jwtVerify(token, tokenSleutel(), { issuer: ISSUER });
    const { tenantId, tenantName, medewerkerId, email, naam } = payload as Record<string, unknown>;
    if ([tenantId, tenantName, medewerkerId, email, naam].some((v) => typeof v !== "string")) return null;
    return { tenantId: tenantId as string, tenantName: tenantName as string, medewerkerId: medewerkerId as string, email: email as string, naam: naam as string };
  } catch {
    return null;
  }
}

export const uitnodigingsLink = (token: string): string => `${env.APP_BASE_URL.replace(/\/+$/, "")}/personeel/uitnodiging?token=${encodeURIComponent(token)}`;

/** Een medewerker toevoegen met een uitnodiging; geeft de gegevens en de link terug (de link gaat per mail en kan ook gekopieerd worden). */
export async function nodigUit(
  tenantId: string,
  tenantName: string,
  input: { naam: string; email: string; functie: string; dashboardId: string },
): Promise<{ data: PersoneelData; medewerker: Medewerker; token: string }> {
  const d = await leesPersoneelVan(tenantId);
  if (!dashboardVan(d, input.dashboardId)) throw AppError.validation("Kies een dashboard voor deze medewerker.");
  const email = schoonEmail(input.email);
  if (d.medewerkers.some((m) => m.email === email && m.status !== "gestopt")) throw AppError.conflict("Deze medewerker staat al in je lijst.");
  if (d.medewerkers.length >= MAX_MEDEWERKERS) throw AppError.validation("Je hebt het maximale aantal medewerkers bereikt.");
  const medewerker: Medewerker = {
    id: randomUUID().slice(0, 12),
    naam: input.naam.trim(),
    email,
    functie: input.functie.trim(),
    dashboardId: input.dashboardId,
    status: "uitgenodigd",
    userId: null,
    uitgenodigd: new Date().toISOString(),
  };
  d.medewerkers = [...d.medewerkers, medewerker];
  await bewaar(tenantId, d);
  return { data: d, medewerker, token: await maakToken({ tenantId, tenantName, medewerkerId: medewerker.id, email, naam: medewerker.naam }) };
}

/** Een nieuwe link voor een medewerker die nog niet heeft geaccepteerd. */
export async function nieuweUitnodiging(tenantId: string, tenantName: string, medewerkerId: string): Promise<{ medewerker: Medewerker; token: string }> {
  const d = await leesPersoneelVan(tenantId);
  const m = d.medewerkers.find((x) => x.id === medewerkerId);
  if (!m || m.status !== "uitgenodigd") throw AppError.precondition("Deze medewerker heeft zijn account al, of staat niet meer in je lijst.");
  return { medewerker: m, token: await maakToken({ tenantId, tenantName, medewerkerId: m.id, email: m.email, naam: m.naam }) };
}

export async function wijzigMedewerker(tenantId: string, id: string, wijziging: { functie?: string | undefined; dashboardId?: string | undefined }): Promise<PersoneelData> {
  const d = await leesPersoneelVan(tenantId);
  if (wijziging.dashboardId !== undefined && !dashboardVan(d, wijziging.dashboardId)) throw AppError.validation("Dit dashboard bestaat niet.");
  if (!d.medewerkers.some((m) => m.id === id)) throw AppError.notFound("Deze medewerker staat niet meer in je lijst.");
  d.medewerkers = d.medewerkers.map((m): Medewerker => {
    if (m.id !== id) return m;
    return { ...m, ...(wijziging.functie !== undefined ? { functie: wijziging.functie.trim() } : {}), ...(wijziging.dashboardId !== undefined ? { dashboardId: wijziging.dashboardId } : {}) };
  });
  await bewaar(tenantId, d);
  return d;
}

/** Stoppen: de medewerker kan niet meer in en de verwijzing naar het bedrijf is weg. Het account zelf blijft van de persoon. */
export async function stopMedewerker(tenantId: string, id: string): Promise<PersoneelData> {
  const d = await leesPersoneelVan(tenantId);
  const m = d.medewerkers.find((x) => x.id === id);
  if (!m) throw AppError.notFound("Deze medewerker staat niet meer in je lijst.");
  if (m.userId) await kvDelete(`${MEDEWERKER_PREFIX}${m.userId}`);
  d.medewerkers = d.medewerkers.map((x): Medewerker => (x.id === id ? { ...x, status: "gestopt" } : x));
  await bewaar(tenantId, d);
  return d;
}

/** Een medewerker helemaal uit de lijst halen (bijvoorbeeld een uitnodiging die nooit is gebruikt). */
export async function verwijderMedewerker(tenantId: string, id: string): Promise<PersoneelData> {
  const d = await leesPersoneelVan(tenantId);
  const m = d.medewerkers.find((x) => x.id === id);
  if (!m) return d;
  if (m.status === "actief") throw AppError.precondition("Stop eerst deze medewerker; een medewerker met een actief account haal je niet zomaar weg.");
  d.medewerkers = d.medewerkers.filter((x) => x.id !== id);
  await bewaar(tenantId, d);
  return d;
}

/** De medewerker heeft zijn account gemaakt (of ingelogd) en de uitnodiging gebruikt. */
export async function koppelAccount(tenantId: string, medewerkerId: string, userId: string): Promise<void> {
  const d = await leesPersoneelVan(tenantId);
  const m = d.medewerkers.find((x) => x.id === medewerkerId);
  if (!m || m.status !== "uitgenodigd") throw AppError.precondition("Deze uitnodiging is niet meer geldig. Vraag je werkgever om een nieuwe.");
  d.medewerkers = d.medewerkers.map((x): Medewerker => (x.id === medewerkerId ? { ...x, status: "actief", userId } : x));
  await bewaar(tenantId, d);
  await kvSet(`${MEDEWERKER_PREFIX}${userId}`, { tenantId, medewerkerId } satisfies MedewerkerVerwijzing);
}

// ---- mededelingen ----------------------------------------------------------

export async function plaatsMededeling(tenantId: string, input: { tekst: string; dashboardIds: string[] }, nu: Date = new Date()): Promise<PersoneelData> {
  const d = await leesPersoneelVan(tenantId);
  const dashboardIds = input.dashboardIds.filter((id) => dashboardVan(d, id));
  const m: Mededeling = { id: randomUUID().slice(0, 10), tekst: input.tekst.trim(), datum: nu.toISOString(), dashboardIds, gelezen: [] };
  // de oudste vallen af als de lijst vol is
  d.mededelingen = [m, ...d.mededelingen].slice(0, 30);
  await bewaar(tenantId, d);
  return d;
}

/** De medewerker heeft deze mededelingen gezien; alleen bestaande mededelingen, en elke medewerker hooguit één keer. */
export async function markeerGelezen(tenantId: string, medewerkerId: string, ids: string[]): Promise<void> {
  const d = await leesPersoneelVan(tenantId);
  let veranderd = false;
  d.mededelingen = d.mededelingen.map((m) => {
    if (!ids.includes(m.id) || m.gelezen.includes(medewerkerId)) return m;
    veranderd = true;
    return { ...m, gelezen: [...m.gelezen, medewerkerId] };
  });
  if (veranderd) await bewaar(tenantId, d);
}

export async function verwijderMededeling(tenantId: string, id: string): Promise<PersoneelData> {
  const d = await leesPersoneelVan(tenantId);
  d.mededelingen = d.mededelingen.filter((m) => m.id !== id);
  await bewaar(tenantId, d);
  return d;
}
