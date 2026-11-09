// ---------------------------------------------------------------------------
// "Verder op je telefoon" (9 nov 2026): de ID-scan op de laptop toont een
// QR-code; de telefoon maakt de foto's en de laptop rondt de verificatie af.
//   1. laptop (ingelogd): POST /api/onboarding/overdracht → eenmalige code
//      (userId + 24 willekeurige bytes), 20 minuten geldig, één per persoon.
//      De QR wijst naar /id-scan#<code>: na de # gaat de code nooit naar een
//      server, dus ook niet in een log.
//   2. telefoon (niet ingelogd): /api/id-overdracht/{open,lezen,klaar} met de
//      code in de body. "klaar" bewaart de drie foto's als gewone uploads.
//   3. laptop: GET /api/onboarding/overdracht ziet "geopend" en dan "klaar", en
//      verstuurt de verificatie (POST /api/onboarding met overdracht=1): de
//      server haalt de foto's hier op (pakOverdracht) en wist ze daarna.
// Alles in KV is verzegeld (AES-256-GCM); wat blijft liggen, wist ruimOverdrachtOp
// (cron, met de foto's). Sleutel met het userId: AVG-wissen neemt hem mee.
// ---------------------------------------------------------------------------

import { randomBytes, timingSafeEqual } from "node:crypto";
import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { deleteUpload, readUpload, storeUpload } from "@/lib/storage/local";

export const OVERDRACHT_PREFIX = "id-overdracht:";
const DOEL = "kyc-overdracht";
const GELDIG_MS = 20 * 60_000;
const OPRUIMEN_MS = 30 * 60_000;

export type DocSoort = "PASSPORT" | "ID_CARD" | "DRIVERS_LICENSE";
export type OverdrachtStatus = "wacht" | "geopend" | "klaar";

export interface OverdrachtGegevens {
  nummer: string;
  datum: string;
  naam: string;
}

interface Overdracht {
  userId: string;
  geheim: string;
  gemaakt: string;
  status: OverdrachtStatus;
  soort?: DocSoort;
  gegevens?: OverdrachtGegevens;
  uploads?: { voor: string; achter: string; selfie: string };
}

export interface Foto {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

const sleutelVan = (userId: string) => `${OVERDRACHT_PREFIX}${userId}`;

async function bewaar(o: Overdracht): Promise<void> {
  await kvSet(sleutelVan(o.userId), { v: sealSecret(JSON.stringify(o), DOEL) });
}

async function lees(userId: string): Promise<Overdracht | null> {
  const rij = await kvGet<{ v?: unknown }>(sleutelVan(userId));
  if (!rij || typeof rij.v !== "string") return null;
  try {
    return JSON.parse(openSecret(rij.v, DOEL)) as Overdracht;
  } catch {
    return null;
  }
}

const geldig = (o: Overdracht, nu: Date) => nu.getTime() - new Date(o.gemaakt).getTime() < GELDIG_MS;

async function wis(o: Overdracht): Promise<void> {
  if (o.uploads) await Promise.all(Object.values(o.uploads).map((id) => deleteUpload(id).catch(() => undefined)));
  await kvDelete(sleutelVan(o.userId)).catch(() => undefined);
}

/** Laptop: een nieuwe code (een oude overdracht van dezelfde persoon vervalt, met zijn foto's). */
export async function maakOverdracht(userId: string, nu: Date = new Date()): Promise<string> {
  const oud = await lees(userId);
  if (oud) await wis(oud);
  const geheim = randomBytes(24).toString("base64url");
  await bewaar({ userId, geheim, gemaakt: nu.toISOString(), status: "wacht" });
  return `${userId}.${geheim}`;
}

/** Telefoon: de code controleren (geheim in vaste tijd vergeleken, niet verlopen). */
async function vanCode(code: string, nu: Date): Promise<Overdracht | null> {
  const m = /^([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{32})$/.exec(code);
  if (!m) return null;
  const o = await lees(m[1]!);
  if (!o || !geldig(o, nu)) return null;
  const a = Buffer.from(o.geheim);
  const b = Buffer.from(m[2]!);
  return a.length === b.length && timingSafeEqual(a, b) ? o : null;
}

/** Telefoon opent de link: de laptop ziet "verbonden". Geeft alleen of de code geldig is. */
export async function openOverdracht(code: string, nu: Date = new Date()): Promise<{ userId: string } | null> {
  const o = await vanCode(code, nu);
  if (!o || o.status === "klaar") return null;
  if (o.status === "wacht") await bewaar({ ...o, status: "geopend" });
  return { userId: o.userId };
}

/** Telefoon: de code is geldig voor nog een stap (lezen). */
export async function overdrachtGeldig(code: string, nu: Date = new Date()): Promise<{ userId: string } | null> {
  const o = await vanCode(code, nu);
  return o && o.status !== "klaar" ? { userId: o.userId } : null;
}

/** Telefoon: de foto's en gegevens inleveren. Daarna is de code klaar (niet nog eens te gebruiken). */
export async function leverOverdrachtIn(
  code: string,
  inlevering: { soort: DocSoort; gegevens: OverdrachtGegevens; voor: Foto; achter: Foto; selfie: Foto },
  nu: Date = new Date(),
): Promise<boolean> {
  const o = await vanCode(code, nu);
  if (!o || o.status === "klaar") return false;
  const [voor, achter, selfie] = await Promise.all(
    [inlevering.voor, inlevering.achter, inlevering.selfie].map((f) => storeUpload({ ...f, uploadedById: o.userId })),
  );
  await bewaar({ ...o, status: "klaar", soort: inlevering.soort, gegevens: inlevering.gegevens, uploads: { voor: voor!.id, achter: achter!.id, selfie: selfie!.id } });
  return true;
}

/** Laptop: hoe staat het? (alleen de eigen overdracht, zonder code) */
export async function overdrachtStatus(
  userId: string,
  nu: Date = new Date(),
): Promise<{ status: OverdrachtStatus | "verlopen"; soort?: DocSoort } | null> {
  const o = await lees(userId);
  if (!o) return null;
  if (o.status !== "klaar" && !geldig(o, nu)) return { status: "verlopen" };
  return { status: o.status, ...(o.soort ? { soort: o.soort } : {}) };
}

/** Laptop: de gegevens van de telefoon bekijken zonder ze op te maken (eerst het formulier controleren). */
export async function overdrachtGegevens(userId: string): Promise<{ soort: DocSoort; gegevens: OverdrachtGegevens } | null> {
  const o = await lees(userId);
  return o && o.status === "klaar" && o.soort && o.gegevens ? { soort: o.soort, gegevens: o.gegevens } : null;
}

/** Laptop rondt af: de foto's en gegevens van de telefoon ophalen; de tijdelijke kopie wordt gewist. */
export async function pakOverdracht(
  userId: string,
): Promise<{ soort: DocSoort; gegevens: OverdrachtGegevens; voor: Foto; achter: Foto; selfie: Foto } | null> {
  const o = await lees(userId);
  if (!o || o.status !== "klaar" || !o.uploads || !o.soort || !o.gegevens) return null;
  const [voor, achter, selfie] = await Promise.all([readUpload(o.uploads.voor), readUpload(o.uploads.achter), readUpload(o.uploads.selfie)]);
  await wis(o);
  return { soort: o.soort, gegevens: o.gegevens, voor, achter, selfie };
}

/** Cron: overdrachten die te lang blijven liggen, met hun foto's, echt wissen. */
export async function ruimOverdrachtOp(nu: Date = new Date()): Promise<number> {
  const rijen = await kvListEntries<{ v?: unknown }>(OVERDRACHT_PREFIX, 500);
  let gewist = 0;
  for (const { key } of rijen) {
    const o = await lees(key.slice(OVERDRACHT_PREFIX.length));
    if (!o) {
      await kvDelete(key).catch(() => undefined); // onleesbaar: weg
      gewist++;
    } else if (nu.getTime() - new Date(o.gemaakt).getTime() > OPRUIMEN_MS) {
      await wis(o);
      gewist++;
    }
  }
  return gewist;
}
