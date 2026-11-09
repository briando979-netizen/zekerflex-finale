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
//
// Na de beveiligingsreview (9 nov):
//   - de code hoort bij het eerste toestel dat hem opent (een eigen toesteltoken,
//     de eerste opening atomair geclaimd): een tweede toestel kan niets lezen of
//     inleveren, en de laptop ziet die poging;
//   - de telefoon toont eerst voor welk account het is (voornaam + gemaskeerd
//     e-mailadres) en kan "dit is niet mijn account" kiezen: dan vervalt de code;
//   - inleveren wordt eerst atomair geclaimd (geen dubbele sets foto's);
//   - de laptop ziet eerst wat er binnenkwam en verstuurt pas na "klopt"; een
//     verificatie via een tweede toestel beslist altijd een mens.
// Na de tweede review (9 nov, H1): of iets via de telefoon binnenkwam, onthoudt de
// server zelf (een merkteken per persoon, 30 dagen), niet de vlag die de laptop
// meestuurt: wie de vlag weglaat en de foto's los instuurt, gaat ook naar een mens.
// En de laptop krijgt de foto's alleen klein en wazig te zien (documentnummer en
// MRZ niet leesbaar), zodat ze nergens anders als "eigen" foto's te gebruiken zijn.
// ---------------------------------------------------------------------------

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { claimIdempotency } from "@/lib/redis";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { deleteUpload, readUpload, storeUpload } from "@/lib/storage/local";

export const OVERDRACHT_PREFIX = "id-overdracht:";
/** Per persoon: wanneer er iets via de telefoon binnenkwam, en hoe vaak "niet mijn account" (30 dagen). */
export const MERK_PREFIX = "id-overdracht-merk:";
const DOEL = "kyc-overdracht";
const GELDIG_MS = 20 * 60_000;
const OPRUIMEN_MS = 30 * 60_000;
const MERK_MS = 30 * 86_400_000;
/** De foto's op de laptop: zo klein en wazig dat het nummer en de MRZ niet te lezen zijn. */
const VOORBEELD_PX = 320;

export type DocSoort = "PASSPORT" | "ID_CARD" | "DRIVERS_LICENSE";
export type OverdrachtStatus = "wacht" | "geopend" | "klaar" | "geweigerd";

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
  /** sha256 van het toesteltoken van het eerste toestel dat de code opende */
  toestel?: string;
  soort?: DocSoort;
  gegevens?: OverdrachtGegevens;
  uploads?: { voor: string; achter: string; selfie: string };
  /** het netwerk van de telefoon bij het inleveren (netwerkVan), alleen om te vergelijken met de laptop */
  net?: string | null;
}

/** Het merkteken per persoon (geen persoonsgegevens: alleen tijden en een aantal). */
export interface OverdrachtMerk {
  /** de laatste keer dat er foto's via de telefoon binnenkwamen */
  geleverdOp: string | null;
  /** hoe vaak een telefoon "dit is niet mijn account" koos */
  geweigerd: number;
  /** de code (codeId) waarbij een tweede toestel het probeerde */
  anderBij: string | null;
  op: string;
}

export interface Foto {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

const sleutelVan = (userId: string) => `${OVERDRACHT_PREFIX}${userId}`;
const merkSleutel = (userId: string) => `${MERK_PREFIX}${userId}`;

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

async function leesMerk(userId: string): Promise<OverdrachtMerk | null> {
  const m = await kvGet<Partial<OverdrachtMerk>>(merkSleutel(userId));
  if (!m || typeof m.op !== "string") return null;
  return {
    geleverdOp: typeof m.geleverdOp === "string" ? m.geleverdOp : null,
    geweigerd: typeof m.geweigerd === "number" ? m.geweigerd : 0,
    anderBij: typeof m.anderBij === "string" ? m.anderBij : null,
    op: m.op,
  };
}

async function werkMerkBij(userId: string, nu: Date, wijzig: (m: OverdrachtMerk) => OverdrachtMerk): Promise<void> {
  const oud = (await leesMerk(userId)) ?? { geleverdOp: null, geweigerd: 0, anderBij: null, op: nu.toISOString() };
  await kvSet(merkSleutel(userId), { ...wijzig(oud), op: nu.toISOString() });
}

/**
 * Hoe de server een inzending ziet (review H1). Kwam er de laatste 30 dagen iets via de
 * telefoon binnen, dan telt elke inzending van deze persoon als "via een tweede toestel",
 * ook zonder de vlag van de laptop.
 */
export async function overdrachtMerk(userId: string, nu: Date = new Date()): Promise<{ viaTelefoon: boolean; geweigerd: number }> {
  const m = await leesMerk(userId);
  if (!m || nu.getTime() - new Date(m.op).getTime() > MERK_MS) return { viaTelefoon: false, geweigerd: 0 };
  const recent = m.geleverdOp !== null && nu.getTime() - new Date(m.geleverdOp).getTime() <= MERK_MS;
  return { viaTelefoon: recent, geweigerd: m.geweigerd };
}

const geldig = (o: Overdracht, nu: Date) => nu.getTime() - new Date(o.gemaakt).getTime() < GELDIG_MS;

async function wis(o: Overdracht): Promise<void> {
  if (o.uploads) await Promise.all(Object.values(o.uploads).map((id) => deleteUpload(id).catch(() => undefined)));
  await kvDelete(sleutelVan(o.userId)).catch(() => undefined);
}

/**
 * Het netwerk van een IP-adres, om telefoon en laptop te vergelijken: IPv4 tot /24, IPv6
 * tot /48. Alleen voor de beoordelaar (zelfde wifi of niet); nooit bewaard na de verificatie.
 */
export function netwerkVan(ip: string | null | undefined): string | null {
  const s = (ip ?? "").trim().toLowerCase();
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(s);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}`;
  if (!s.includes(":") || !/^[0-9a-f:]+$/.test(s)) return null;
  const [kop = "", staart = ""] = s.split("::");
  const delen = kop ? kop.split(":") : [];
  if (s.includes("::")) {
    const achter = staart ? staart.split(":") : [];
    while (delen.length + achter.length < 8) delen.push("0");
    delen.push(...achter);
  }
  if (delen.length !== 8) return null;
  return delen.slice(0, 3).map((d) => d.replace(/^0+(?=.)/, "")).join(":");
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

const hashToestel = (token: string) => createHash("sha256").update(token).digest("hex");
/** Een vaste, niet terug te rekenen naam per code (voor claims en het merkteken; nooit het geheim zelf). */
const codeId = (o: Overdracht) => createHash("sha256").update(`code:${o.geheim}`).digest("hex").slice(0, 24);

/** Hoort dit toesteltoken bij het toestel dat de code als eerste opende? (vaste tijd) */
function toestelKlopt(o: Overdracht, token: string | null | undefined): boolean {
  if (!o.toestel || typeof token !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(token)) return false;
  const a = Buffer.from(o.toestel);
  const b = Buffer.from(hashToestel(token));
  return a.length === b.length && timingSafeEqual(a, b);
}

export type OpenUitslag = { userId: string; toestel: string } | { anderToestel: true } | null;

/**
 * Telefoon opent de link: de laptop ziet "verbonden". Het eerste toestel krijgt een eigen
 * toesteltoken (alleen de hash wordt bewaard); dat toestel kan met dat token ook na herladen
 * verder. De eerste opening wordt atomair geclaimd: twee toestellen tegelijk krijgen nooit
 * allebei een token. Een ander toestel krijgt { anderToestel } en de laptop ziet die poging
 * (in het merkteken, zodat dat de overdracht zelf nooit overschrijft).
 */
export async function openOverdracht(code: string, toestel?: string | null, nu: Date = new Date()): Promise<OpenUitslag> {
  const o = await vanCode(code, nu);
  if (!o || o.status === "klaar" || o.status === "geweigerd") return null;
  if (o.status === "wacht") {
    // Redis even weg: dan toch openen (het toesteltoken beschermt nog steeds), liever dan niemand
    const eerste = await claimIdempotency(`id-overdracht-open:${o.userId}:${codeId(o)}`, 60 * 60).catch(() => true);
    if (eerste) {
      const token = randomBytes(24).toString("base64url");
      await bewaar({ ...o, status: "geopend", toestel: hashToestel(token) });
      return { userId: o.userId, toestel: token };
    }
  } else if (toestelKlopt(o, toestel)) {
    return { userId: o.userId, toestel: toestel as string };
  }
  await werkMerkBij(o.userId, nu, (m) => ({ ...m, anderBij: codeId(o) })).catch(() => undefined);
  return { anderToestel: true };
}

/** Telefoon: de code is geldig voor nog een stap (lezen, inleveren), alleen vanaf het eigen toestel. */
export async function overdrachtGeldig(code: string, toestel: string | null | undefined, nu: Date = new Date()): Promise<{ userId: string } | null> {
  const o = await vanCode(code, nu);
  return o && o.status === "geopend" && toestelKlopt(o, toestel) ? { userId: o.userId } : null;
}

/** Telefoon: "dit is niet mijn account". De code vervalt meteen; de laptop ziet "geweigerd", de beoordelaar later ook. */
export async function weigerOverdracht(code: string, toestel: string | null | undefined, nu: Date = new Date()): Promise<{ userId: string } | null> {
  const o = await vanCode(code, nu);
  if (!o || o.status !== "geopend" || !toestelKlopt(o, toestel)) return null;
  await wis(o);
  await bewaar({ userId: o.userId, geheim: randomBytes(24).toString("base64url"), gemaakt: o.gemaakt, status: "geweigerd" });
  await werkMerkBij(o.userId, nu, (m) => ({ ...m, geweigerd: m.geweigerd + 1 }));
  return { userId: o.userId };
}

/** Telefoon: de foto's en gegevens inleveren. Daarna is de code klaar (niet nog eens te gebruiken). */
export async function leverOverdrachtIn(
  code: string,
  toestel: string | null | undefined,
  inlevering: { soort: DocSoort; gegevens: OverdrachtGegevens; voor: Foto; achter: Foto; selfie: Foto; net?: string | null },
  nu: Date = new Date(),
): Promise<boolean> {
  const o = await vanCode(code, nu);
  if (!o || o.status !== "geopend" || !toestelKlopt(o, toestel)) return false;
  // eerst claimen: tegelijk inleveren met dezelfde code slaat nooit meerdere sets foto's op.
  // Is Redis even weg, dan liever opnieuw proberen dan dubbel opslaan.
  const geclaimd = await claimIdempotency(`id-overdracht-klaar:${o.userId}:${codeId(o)}`, 60 * 60).catch(() => false);
  if (!geclaimd) return false;
  // eerst het merkteken (review H1): vanaf nu gaat elke inzending van deze persoon naar een mens
  await werkMerkBij(o.userId, nu, (m) => ({ ...m, geleverdOp: nu.toISOString() }));
  const opgeslagen = await Promise.allSettled(
    [inlevering.voor, inlevering.achter, inlevering.selfie].map((f) => storeUpload({ ...f, uploadedById: o.userId })),
  );
  const ids = opgeslagen.flatMap((r) => (r.status === "fulfilled" ? [r.value.id] : []));
  if (ids.length !== 3) {
    // half gelukt: niets laten slingeren
    await Promise.all(ids.map((id) => deleteUpload(id).catch(() => undefined)));
    throw new Error("foto's opslaan mislukt");
  }
  await bewaar({
    ...o,
    status: "klaar",
    soort: inlevering.soort,
    gegevens: inlevering.gegevens,
    uploads: { voor: ids[0]!, achter: ids[1]!, selfie: ids[2]! },
    net: inlevering.net ?? null,
  });
  return true;
}

/** Laptop: hoe staat het? (alleen de eigen overdracht, zonder code) */
export async function overdrachtStatus(
  userId: string,
  nu: Date = new Date(),
): Promise<{ status: OverdrachtStatus | "verlopen"; soort?: DocSoort; anderToestel?: true } | null> {
  const o = await lees(userId);
  if (!o) return null;
  if (o.status !== "klaar" && o.status !== "geweigerd" && !geldig(o, nu)) return { status: "verlopen" };
  const ander = (await leesMerk(userId).catch(() => null))?.anderBij === codeId(o);
  return { status: o.status, ...(o.soort ? { soort: o.soort } : {}), ...(ander ? { anderToestel: true as const } : {}) };
}

/** "…123": alleen het einde van het documentnummer, voor de controle op de laptop. */
export function nummerEinde(nummer: string): string {
  const schoon = nummer.replace(/\s+/g, "");
  return schoon.length <= 3 ? "…" : `…${schoon.slice(-3)}`;
}

/** "b•••@gmail.com": herkenbaar voor de eigenaar van het adres, niet uit te lezen voor een ander. */
export function maskeerEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

/** Laptop: wat er van de telefoon binnenkwam, om te controleren vóór het versturen (geen volledig nummer). */
export async function overdrachtVoorbeeld(userId: string): Promise<{ soort: DocSoort; naam: string; nummer: string; datum: string } | null> {
  const o = await lees(userId);
  if (!o || o.status !== "klaar" || !o.soort || !o.gegevens) return null;
  return { soort: o.soort, naam: o.gegevens.naam, nummer: nummerEinde(o.gegevens.nummer), datum: o.gegevens.datum };
}

/**
 * Laptop: één foto van de telefoon bekijken (alleen de eigen overdracht, achter de login).
 * Alleen een klein, wazig voorbeeld (review H1): genoeg om je eigen document en gezicht te
 * herkennen, te weinig om het nummer of de MRZ te lezen of de foto elders opnieuw in te sturen.
 */
export async function overdrachtFoto(userId: string, welke: "voor" | "achter" | "selfie"): Promise<Foto | null> {
  const o = await lees(userId);
  const id = o && o.status === "klaar" ? o.uploads?.[welke] : undefined;
  const f = id ? await readUpload(id).catch(() => null) : null;
  if (!f) return null;
  const klein = await sharp(f.bytes, { failOn: "none" })
    .resize({ width: VOORBEELD_PX, height: VOORBEELD_PX, fit: "inside", withoutEnlargement: true })
    .blur(1.6)
    .jpeg({ quality: 45 })
    .toBuffer()
    .catch(() => null);
  return klein ? { filename: `${welke}-voorbeeld.jpg`, mimeType: "image/jpeg", bytes: klein } : null;
}

/** Laptop: "klopt niet" (en het wissen van een account): alles van de telefoon weg, opnieuw beginnen. */
export async function annuleerOverdracht(userId: string): Promise<void> {
  const o = await lees(userId);
  if (o) await wis(o);
}

/** Laptop: de gegevens van de telefoon bekijken zonder ze op te maken (eerst het formulier controleren). */
export async function overdrachtGegevens(userId: string): Promise<{ soort: DocSoort; gegevens: OverdrachtGegevens } | null> {
  const o = await lees(userId);
  return o && o.status === "klaar" && o.soort && o.gegevens ? { soort: o.soort, gegevens: o.gegevens } : null;
}

/** Laptop rondt af: de foto's en gegevens van de telefoon ophalen; de tijdelijke kopie wordt gewist. */
export async function pakOverdracht(
  userId: string,
): Promise<{ soort: DocSoort; gegevens: OverdrachtGegevens; voor: Foto; achter: Foto; selfie: Foto; net: string | null } | null> {
  const o = await lees(userId);
  if (!o || o.status !== "klaar" || !o.uploads || !o.soort || !o.gegevens) return null;
  const [voor, achter, selfie] = await Promise.all([readUpload(o.uploads.voor), readUpload(o.uploads.achter), readUpload(o.uploads.selfie)]);
  await wis(o);
  return { soort: o.soort, gegevens: o.gegevens, voor, achter, selfie, net: o.net ?? null };
}

/** Cron: overdrachten die te lang blijven liggen (met hun foto's) en oude merktekens echt wissen. */
export async function ruimOverdrachtOp(nu: Date = new Date()): Promise<number> {
  // ruim: één rij per persoon, en de lijst begint bij de nieuwste
  const rijen = await kvListEntries<{ v?: unknown }>(OVERDRACHT_PREFIX, 5000);
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
  const merken = await kvListEntries<Partial<OverdrachtMerk>>(MERK_PREFIX, 5000);
  for (const { key, value } of merken) {
    const op = typeof value?.op === "string" ? new Date(value.op).getTime() : NaN;
    if (!Number.isFinite(op) || nu.getTime() - op > MERK_MS) {
      await kvDelete(key).catch(() => undefined);
      gewist++;
    }
  }
  return gewist;
}
