import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { connect, constants, type ClientHttp2Session } from "node:http2";
import { logger } from "@/lib/logger";
import { kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Pushmeldingen naar de iPhone-app (APNs, rechtstreeks bij Apple; geen Firebase
// of andere tussenpartij, AGENTS.md "alles gratis"). In een WKWebView werkt Web
// Push niet, dus de app geeft zijn eigen apparaatcode (device token) door: de
// app roept na het inloggen POST /api/me/apns aan vanuit de pagina zelf.
//
// Aan zodra deze sleutels op de server staan (Apple Developer → Keys → een
// sleutel met "Apple Push Notifications service"; owner-todo "ios-app"):
//   APNS_KEY_P8   de inhoud van het .p8-bestand (PEM, of base64 daarvan)
//   APNS_KEY_ID   de Key ID van die sleutel
//   APNS_TEAM_ID  de Team ID van het ontwikkelaarsaccount
//   APNS_TOPIC    de bundel-id van de app (standaard com.zekerflex.app)
//   APNS_SANDBOX  "1" voor testbuilds uit Xcode (TestFlight en App Store: niet zetten)
// Zonder sleutels doet dit niets. De apparaatcodes staan in KV onder "apns:<userId>"
// (AVG: ERASABLE_KV_PREFIXES). Een code die Apple niet meer kent, gaat eruit.
// ---------------------------------------------------------------------------

export const APNS_PREFIX = "apns:";
const MAX_TOESTELLEN = 5;
const JWT_GELDIG_MS = 50 * 60_000; // Apple: hooguit een uur, niet vaker dan elke 20 min vernieuwen

export interface ApnsConfig {
  sleutel: KeyObject;
  keyId: string;
  teamId: string;
  topic: string;
  host: string;
}

interface Toestellen {
  tokens: { token: string; op: string }[];
}

/** Het .p8-bestand mag als PEM (met echte of geschreven \n) of als base64 in de omgeving staan. */
export function leesP8(waarde: string): string {
  const s = waarde.trim();
  if (s.includes("BEGIN PRIVATE KEY")) return s.replace(/\\n/g, "\n");
  const pem = Buffer.from(s, "base64").toString("utf8");
  return pem.includes("BEGIN PRIVATE KEY") ? pem : "";
}

let cache: { bron: string; config: ApnsConfig | null } | null = null;

export function apnsConfig(omgeving: NodeJS.ProcessEnv = process.env): ApnsConfig | null {
  const p8 = omgeving.APNS_KEY_P8 ?? "";
  const keyId = (omgeving.APNS_KEY_ID ?? "").trim();
  const teamId = (omgeving.APNS_TEAM_ID ?? "").trim();
  const bron = `${p8}|${keyId}|${teamId}|${omgeving.APNS_TOPIC ?? ""}|${omgeving.APNS_SANDBOX ?? ""}`;
  if (cache?.bron === bron) return cache.config;
  let config: ApnsConfig | null = null;
  const pem = p8 ? leesP8(p8) : "";
  if (pem && /^[A-Z0-9]{10}$/.test(keyId) && /^[A-Z0-9]{10}$/.test(teamId)) {
    try {
      config = {
        sleutel: createPrivateKey(pem),
        keyId,
        teamId,
        topic: (omgeving.APNS_TOPIC ?? "").trim() || "com.zekerflex.app",
        host: omgeving.APNS_SANDBOX === "1" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com",
      };
    } catch (err) {
      logger.warn("apns: sleutel onleesbaar", { error: (err as Error).message });
    }
  }
  cache = { bron, config };
  return config;
}

export const isApnsEnabled = (): boolean => apnsConfig() !== null;

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Het provider-token voor Apple: een JWT met ES256, getekend met de .p8-sleutel. */
export function apnsJwt(c: ApnsConfig, nu: Date = new Date()): string {
  const kop = b64url(JSON.stringify({ alg: "ES256", kid: c.keyId }));
  const inhoud = b64url(JSON.stringify({ iss: c.teamId, iat: Math.floor(nu.getTime() / 1000) }));
  const handtekening = sign("sha256", Buffer.from(`${kop}.${inhoud}`), { key: c.sleutel, dsaEncoding: "ieee-p1363" });
  return `${kop}.${inhoud}.${b64url(handtekening)}`;
}

let jwtCache: { sleutel: string; jwt: string; tot: number } | null = null;
function huidigeJwt(c: ApnsConfig): string {
  const sleutel = `${c.teamId}:${c.keyId}`;
  const nu = Date.now();
  if (jwtCache && jwtCache.sleutel === sleutel && jwtCache.tot > nu) return jwtCache.jwt;
  const jwt = apnsJwt(c, new Date(nu));
  jwtCache = { sleutel, jwt, tot: nu + JWT_GELDIG_MS };
  return jwt;
}

/** Een apparaatcode van Apple: hex, 64 tekens (of langer bij nieuwere toestellen). */
export const isApnsToken = (t: unknown): t is string => typeof t === "string" && /^[0-9a-f]{64,200}$/i.test(t);

/**
 * Bewaart de apparaatcode bij dit account. Logt er op dezelfde iPhone iemand anders in,
 * dan gaat de code weg bij het vorige account (anders krijgt de nieuwe gebruiker diens
 * meldingen). Zoeken door alle rijen is prima bij deze aantallen; groeit het, dan een index.
 */
export async function bewaarApnsToken(userId: string, token: string, nu: Date = new Date()): Promise<void> {
  const t = token.toLowerCase();
  for (const { key, value } of await kvListEntries<Toestellen>(APNS_PREFIX, 5000)) {
    if (key === `${APNS_PREFIX}${userId}` || !value?.tokens?.some((x) => x.token === t)) continue;
    await kvSet(key, { tokens: value.tokens.filter((x) => x.token !== t) });
  }
  const oud = (await kvGet<Toestellen>(`${APNS_PREFIX}${userId}`))?.tokens ?? [];
  const tokens = [{ token: t, op: nu.toISOString() }, ...oud.filter((x) => x.token !== t)].slice(0, MAX_TOESTELLEN);
  await kvSet(`${APNS_PREFIX}${userId}`, { tokens });
}

export async function verwijderApnsToken(userId: string, token: string): Promise<void> {
  const t = token.toLowerCase();
  const oud = (await kvGet<Toestellen>(`${APNS_PREFIX}${userId}`))?.tokens ?? [];
  await kvSet(`${APNS_PREFIX}${userId}`, { tokens: oud.filter((x) => x.token !== t) });
}

async function tokensVan(userIds: string[]): Promise<{ userId: string; token: string }[]> {
  const rijen = await Promise.all(userIds.map(async (u) => ({ u, t: (await kvGet<Toestellen>(`${APNS_PREFIX}${u}`))?.tokens ?? [] })));
  return rijen.flatMap(({ u, t }) => t.map((x) => ({ userId: u, token: x.token })));
}

export interface ApnsBericht {
  title: string;
  body: string;
  /** zoals bij Web Push: url (waar een tik naartoe gaat), type, tag … */
  data: Record<string, string>;
  ttlSeconds: number;
}

/** De inhoud voor Apple: de melding in "aps", de rest (url, type) ernaast voor de app. */
export function apnsInhoud(b: ApnsBericht): string {
  return JSON.stringify({
    aps: { alert: { title: b.title, body: b.body }, sound: "default", ...(b.data.tag ? { "thread-id": b.data.tag } : {}) },
    ...b.data,
  });
}

type Uitslag = { ok: boolean; weg: boolean; status: number };

function stuurEen(sessie: ClientHttp2Session, c: ApnsConfig, token: string, inhoud: string, b: ApnsBericht): Promise<Uitslag> {
  return new Promise((resolve) => {
    const verzoek = sessie.request({
      [constants.HTTP2_HEADER_METHOD]: "POST",
      [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
      authorization: `bearer ${huidigeJwt(c)}`,
      "apns-topic": c.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + Math.max(0, b.ttlSeconds)),
      ...(b.data.tag ? { "apns-collapse-id": b.data.tag.slice(0, 64) } : {}),
      "content-type": "application/json",
    });
    let status = 0;
    let antwoord = "";
    verzoek.setEncoding("utf8");
    verzoek.on("response", (h) => {
      status = Number(h[constants.HTTP2_HEADER_STATUS] ?? 0);
    });
    verzoek.on("data", (d: string) => {
      antwoord += d;
    });
    verzoek.on("end", () => {
      let reden = "";
      try {
        reden = (JSON.parse(antwoord || "{}") as { reason?: string }).reason ?? "";
      } catch {
        reden = "";
      }
      // 410: de app is weg; 400 BadDeviceToken / DeviceTokenNotForTopic: deze code hoort hier niet
      const weg = status === 410 || (status === 400 && (reden === "BadDeviceToken" || reden === "DeviceTokenNotForTopic"));
      if (status !== 200 && !weg) logger.warn("apns: melding geweigerd", { status, reden });
      resolve({ ok: status === 200, weg, status });
    });
    verzoek.on("error", (err) => {
      logger.warn("apns: verzenden mislukt", { error: err.message });
      resolve({ ok: false, weg: false, status: 0 });
    });
    verzoek.setTimeout(10_000, () => verzoek.close(constants.NGHTTP2_CANCEL));
    verzoek.end(inhoud);
  });
}

/** Stuurt naar elke iPhone van deze accounts. Geeft terug hoeveel toestellen het aannamen. */
export async function sendApnsToUsers(userIds: string[], b: ApnsBericht): Promise<number> {
  const c = apnsConfig();
  if (!c || userIds.length === 0) return 0;
  const doelen = await tokensVan(userIds).catch(() => []);
  if (doelen.length === 0) return 0;
  const inhoud = apnsInhoud(b);
  let sessie: ClientHttp2Session;
  try {
    sessie = connect(c.host);
  } catch (err) {
    logger.warn("apns: geen verbinding", { error: (err as Error).message });
    return 0;
  }
  sessie.on("error", (err) => logger.warn("apns: verbinding verbroken", { error: err.message }));
  try {
    const uitslagen = await Promise.all(doelen.map(async (d) => ({ d, u: await stuurEen(sessie, c, d.token, inhoud, b) })));
    for (const { d } of uitslagen.filter((x) => x.u.weg)) await verwijderApnsToken(d.userId, d.token).catch(() => undefined);
    return uitslagen.filter((x) => x.u.ok).length;
  } finally {
    sessie.close();
  }
}
