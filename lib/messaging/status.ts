import { randomUUID } from "node:crypto";
import { kvDelete, kvGet, kvGetMany, kvListKeys, kvSet } from "@/lib/storage/kv";
import { deleteUpload, readUpload } from "@/lib/storage/local";
import { logger } from "@/lib/logger";
import { listContacts } from "@/lib/messaging/contact-book";
import { listThreadsForUser } from "@/lib/messaging/store";
import { blockedBetween } from "@/lib/messaging/thread-prefs";
import { userDirectory } from "@/lib/messaging/contacts";
import { STATUS_DUUR_MS, STATUS_MAX_PER_PERSOON, type EigenStatus, type StatusFeed, type StatusKaart } from "@/lib/messaging/status-vorm";

// ---------------------------------------------------------------------------
// Status in de chat (15 nov 2026), zoals in WhatsApp: tekst of foto, 24 uur zichtbaar.
//
// Wie ziet hem: alleen wederzijds, zoals in WhatsApp: wie met jou een direct gesprek heeft, of als jullie elkaar allebei
// als contact bewaarden. Iemand die jou bewaarde terwijl jij hem niet kent, ziet niets. Geblokkeerd (welke kant ook): niet. Wie hem zag, ziet alleen de eigenaar. Foto's gaan alleen via
// /api/inbox/status/<id>/media met dezelfde controle; voor ieder ander bestaat hij niet (404).
//
// Opslag: één rij per persoon (chat-status:<userId>, in ERASABLE_KV_PREFIXES: inzage en wissen). Wat verlopen is, gaat
// eruit zodra iemand de rij leest, en elk uur via de cron (/api/internal/chat/status-opruimen), met de foto erbij.
// ---------------------------------------------------------------------------

export interface ChatStatus {
  id: string;
  userId: string;
  soort: "tekst" | "foto";
  tekst?: string;
  kleur?: number;
  /** foto: het upload-id (lib/storage/local), nooit naar de browser */
  mediaId?: string;
  at: string;
  tot: string;
  /** wie hem zag: userId → tijd (ISO) */
  gezien: Record<string, string>;
}

const sleutel = (userId: string) => `chat-status:${userId}`;
const lopend = (s: ChatStatus, nu: Date) => new Date(s.tot).getTime() > nu.getTime();

/** De statussen van één persoon die nog lopen; verlopen worden hier opgeruimd (met hun foto). */
async function lees(userId: string, nu: Date, rij?: ChatStatus[] | null): Promise<ChatStatus[]> {
  const alle = rij !== undefined ? (rij ?? []) : ((await kvGet<ChatStatus[]>(sleutel(userId))) ?? []);
  const nog = alle.filter((s) => lopend(s, nu));
  if (nog.length !== alle.length) {
    if (nog.length) await kvSet(sleutel(userId), nog);
    else await kvDelete(sleutel(userId));
    for (const s of alle) if (!lopend(s, nu) && s.mediaId) await deleteUpload(s.mediaId).catch(() => undefined);
  }
  return nog;
}

export type NieuweStatus = { soort: "tekst"; tekst: string; kleur: number } | { soort: "foto"; mediaId: string; tekst?: string };

/** Een status plaatsen; null als je er al te veel hebt staan. */
export async function plaatsStatus(userId: string, input: NieuweStatus, nu = new Date()): Promise<ChatStatus | null> {
  const nog = await lees(userId, nu);
  if (nog.length >= STATUS_MAX_PER_PERSOON) return null;
  const s: ChatStatus = {
    id: randomUUID(),
    userId,
    soort: input.soort,
    ...(input.tekst ? { tekst: input.tekst } : {}),
    ...(input.soort === "tekst" ? { kleur: input.kleur } : { mediaId: input.mediaId }),
    at: nu.toISOString(),
    tot: new Date(nu.getTime() + STATUS_DUUR_MS).toISOString(),
    gezien: {},
  };
  await kvSet(sleutel(userId), [...nog, s]);
  return s;
}

/** Je eigen status weghalen (met de foto); false als hij er niet (meer) is. */
export async function verwijderStatus(userId: string, id: string, nu = new Date()): Promise<boolean> {
  const nog = await lees(userId, nu);
  const weg = nog.find((s) => s.id === id);
  if (!weg) return false;
  const rest = nog.filter((s) => s.id !== id);
  if (rest.length) await kvSet(sleutel(userId), rest);
  else await kvDelete(sleutel(userId));
  if (weg.mediaId) await deleteUpload(weg.mediaId).catch(() => undefined);
  return true;
}

/** Een direct gesprek tussen twee mensen (wederzijds: dan zien ze elkaars status). */
async function directePartners(userId: string): Promise<Set<string>> {
  const gesprekken = await listThreadsForUser(userId, false);
  return new Set(gesprekken.filter((t) => t.kind === "direct").flatMap((t) => t.participants).filter((id) => id !== userId));
}

/** Mag `kijker` de status van `eigenaar` zien? */
export async function magZien(kijker: string, eigenaar: string): Promise<boolean> {
  if (kijker === eigenaar) return true;
  if (await blockedBetween(kijker, eigenaar)) return false;
  const [vanEigenaar, vanKijker] = await Promise.all([listContacts(eigenaar), listContacts(kijker)]);
  if (vanEigenaar.some((c) => c.userId === kijker) && vanKijker.some((c) => c.userId === eigenaar)) return true;
  return (await directePartners(kijker)).has(eigenaar);
}

const kaart = (s: ChatStatus, kijker: string): StatusKaart => ({
  id: s.id,
  soort: s.soort,
  ...(s.tekst ? { tekst: s.tekst } : {}),
  ...(s.kleur !== undefined ? { kleur: s.kleur } : {}),
  at: s.at,
  tot: s.tot,
  gezien: Boolean(s.gezien[kijker]),
});

/** Wat `kijker` ziet: je eigen statussen (met wie ze zag) en die van je contacten, nog niet geziene eerst. */
export async function statusFeed(kijker: string, nu = new Date()): Promise<StatusFeed> {
  const [partners, contacten] = await Promise.all([directePartners(kijker), listContacts(kijker)]);
  const kandidaten = [...new Set([...partners, ...contacten.map((c) => c.userId)])].filter((id) => id !== kijker);
  const rijen = await kvGetMany<ChatStatus[]>([sleutel(kijker), ...kandidaten.map(sleutel)]);
  const mijn = await lees(kijker, nu, rijen.get(sleutel(kijker)) ?? null);

  const anderen: { userId: string; statussen: StatusKaart[] }[] = [];
  for (const id of kandidaten) {
    const rij = rijen.get(sleutel(id));
    if (!rij?.some((s) => lopend(s, nu))) continue;
    // een direct gesprek is wederzijds; anders moet de ander jou óók als contact hebben bewaard (de kijker bewaarde hem al)
    if (await blockedBetween(kijker, id)) continue;
    if (!partners.has(id) && !(await listContacts(id)).some((c) => c.userId === kijker)) continue;
    const statussen = (await lees(id, nu, rij)).map((s) => kaart(s, kijker));
    if (statussen.length) anderen.push({ userId: id, statussen });
  }
  const zagMij = [...new Set(mijn.flatMap((s) => Object.keys(s.gezien)))];
  const gids = await userDirectory([...anderen.map((a) => a.userId), ...zagMij]);
  const naam = (id: string) => gids.get(id)?.name ?? "";
  // nog niet alles gezien eerst, daarna de nieuwste bovenaan
  const laatste = (a: { statussen: StatusKaart[] }) => a.statussen.at(-1)?.at ?? "";
  anderen.sort((a, b) => Number(a.statussen.every((s) => s.gezien)) - Number(b.statussen.every((s) => s.gezien)) || (laatste(a) < laatste(b) ? 1 : -1));
  return {
    mijn: mijn.map(
      (s): EigenStatus => ({
        id: s.id,
        soort: s.soort,
        ...(s.tekst ? { tekst: s.tekst } : {}),
        ...(s.kleur !== undefined ? { kleur: s.kleur } : {}),
        at: s.at,
        tot: s.tot,
        gezienDoor: s.gezien,
      }),
    ),
    anderen: anderen.map((a) => ({ ...a, naam: naam(a.userId) })),
    namen: Object.fromEntries(zagMij.map((id) => [id, naam(id)])),
  };
}

/** `kijker` zag een status van `eigenaar`; false als hij er niet is of niet voor de kijker. */
export async function markeerGezien(kijker: string, eigenaar: string, id: string, nu = new Date()): Promise<boolean> {
  if (kijker === eigenaar || !(await magZien(kijker, eigenaar))) return false;
  const nog = await lees(eigenaar, nu);
  const s = nog.find((x) => x.id === id);
  if (!s) return false;
  if (!s.gezien[kijker]) {
    s.gezien[kijker] = nu.toISOString();
    await kvSet(sleutel(eigenaar), nog);
  }
  return true;
}

/** De foto van een status, alleen voor wie hem mag zien; anders null. */
export async function statusFoto(kijker: string, eigenaar: string, id: string, nu = new Date()): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const s = (await lees(eigenaar, nu)).find((x) => x.id === id);
  if (!s?.mediaId || !(await magZien(kijker, eigenaar))) return null;
  try {
    const f = await readUpload(s.mediaId);
    return { bytes: f.bytes, mimeType: f.mimeType };
  } catch {
    return null;
  }
}

/** De cron (elk uur): verlopen statussen en hun foto's weg, ook van wie niemand meer leest. */
export async function ruimStatusOp(nu = new Date()): Promise<number> {
  let weg = 0;
  for (const key of await kvListKeys("chat-status:", 10_000)) {
    const userId = key.slice("chat-status:".length);
    const voor = (await kvGet<ChatStatus[]>(key)) ?? [];
    try {
      weg += voor.length - (await lees(userId, nu, voor)).length;
    } catch (err) {
      logger.warn("status opruimen mislukt", { error: (err as Error).message });
    }
  }
  return weg;
}
