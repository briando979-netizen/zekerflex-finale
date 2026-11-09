import { createHash, timingSafeEqual } from "node:crypto";
import { alsMap, leesCbor, leesCborGeheel, type CborWaarde } from "@/lib/auth/passkey/cbor";
import { coseNaarSleutel, handtekeningKlopt, ONDERSTEUNDE_ALGORITMES } from "@/lib/auth/passkey/cose";

// ---------------------------------------------------------------------------
// WebAuthn (Level 2/3) aan de serverkant, puur: geen database, geen Redis.
// Volgt de stappen van de specificatie:
//   §7.1 een nieuwe passkey registreren (webauthn.create)
//   §7.2 een inlogpoging controleren (webauthn.get)
//
// Attestatie: we vragen "none" en vertrouwen het toestel niet op grond van een
// attestatie. Stuurt een toestel toch een verklaring mee (bijv. "packed"), dan
// lezen we die niet: de passkey wordt alleen toegevoegd door een ingelogde
// gebruiker die zich net opnieuw heeft bevestigd, en elke inlog bewijst daarna
// zelf het bezit van de sleutel met een handtekening.
// ---------------------------------------------------------------------------

/** Waarom een registratie of inlog is geweigerd (voor de log en de tests; de gebruiker ziet een gewone zin). */
export type PasskeyReden =
  | "ongeldig" // kapotte of onvolledige gegevens
  | "type" // clientDataJSON.type klopt niet
  | "challenge" // niet de challenge die wij gaven
  | "origin" // niet onze site
  | "cross_origin" // vanuit een frame op een andere site
  | "rp_id" // rpIdHash hoort niet bij ons domein
  | "up" // geen aanraking (gebruiker niet aanwezig)
  | "uv" // geen vingerafdruk/gezicht/pincode terwijl dat moest
  | "be_bs" // vlaggen tegenstrijdig (BS zonder BE)
  | "credential_id" // id te lang/kort of anders dan rawId
  | "sleutel" // sleutel onbekend, kapot of algoritme niet ondersteund
  | "user_handle" // de passkey hoort niet bij deze gebruiker
  | "handtekening" // handtekening klopt niet
  | "teller"; // teller liep terug: mogelijk een gekopieerd toestel

export interface Verwacht {
  /** base64url van de challenge die wij bewaard hebben */
  challenge: string;
  /** exacte origin, bijv. https://zekerflex.com */
  origin: string;
  /** domein, bijv. zekerflex.com */
  rpId: string;
  /** vingerafdruk/gezicht/pincode verplicht (UV-vlag) */
  uvVerplicht: boolean;
}

export interface AuthData {
  rpIdHash: Buffer;
  up: boolean;
  uv: boolean;
  /** backup eligible: de passkey kan gesynchroniseerd worden */
  be: boolean;
  /** backup state: de passkey is gesynchroniseerd */
  bs: boolean;
  at: boolean;
  ed: boolean;
  signCount: number;
  credential: { aaguid: Buffer; credentialId: Buffer; publicKey: Buffer } | null;
  extensions: CborWaarde | null;
}

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_BE = 0x08;
const FLAG_BS = 0x10;
const FLAG_AT = 0x40;
const FLAG_ED = 0x80;

export const sha256 = (b: Buffer | string): Buffer => createHash("sha256").update(b).digest();

/** authenticatorData uit elkaar halen (§6.1). Gooit bij kapotte gegevens. */
export function leesAuthData(buf: Buffer): AuthData {
  if (buf.length < 37) throw new Error("authenticatorData te kort");
  const flags = buf.readUInt8(32);
  const at = Boolean(flags & FLAG_AT);
  const ed = Boolean(flags & FLAG_ED);
  let pos = 37;
  let credential: AuthData["credential"] = null;
  if (at) {
    if (buf.length < pos + 18) throw new Error("attested credential data te kort");
    const aaguid = Buffer.from(buf.subarray(pos, pos + 16));
    const len = buf.readUInt16BE(pos + 16);
    pos += 18;
    if (buf.length < pos + len) throw new Error("credential-id loopt voorbij het einde");
    const credentialId = Buffer.from(buf.subarray(pos, pos + len));
    pos += len;
    const sleutel = leesCbor(buf, pos);
    const publicKey = Buffer.from(buf.subarray(pos, sleutel.einde));
    pos = sleutel.einde;
    credential = { aaguid, credentialId, publicKey };
  }
  let extensions: CborWaarde | null = null;
  if (ed) {
    const ext = leesCbor(buf, pos);
    extensions = alsMap(ext.waarde, "extensies");
    pos = ext.einde;
  }
  if (pos !== buf.length) throw new Error("onverwachte bytes na authenticatorData");
  return {
    rpIdHash: Buffer.from(buf.subarray(0, 32)),
    up: Boolean(flags & FLAG_UP),
    uv: Boolean(flags & FLAG_UV),
    be: Boolean(flags & FLAG_BE),
    bs: Boolean(flags & FLAG_BS),
    at,
    ed,
    signCount: buf.readUInt32BE(33),
    credential,
    extensions,
  };
}

interface ClientData {
  type: string;
  challenge: string;
  origin: string;
  crossOrigin?: boolean;
  topOrigin?: string;
}

/** clientDataJSON lezen (UTF-8, JSON). Gooit bij kapotte gegevens. */
export function leesClientData(buf: Buffer): ClientData {
  const tekst = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(buf);
  const c = JSON.parse(tekst) as Record<string, unknown>;
  if (typeof c !== "object" || c === null) throw new Error("clientDataJSON is geen object");
  if (typeof c.type !== "string" || typeof c.challenge !== "string" || typeof c.origin !== "string") {
    throw new Error("clientDataJSON mist type, challenge of origin");
  }
  return {
    type: c.type,
    challenge: c.challenge,
    origin: c.origin,
    ...(typeof c.crossOrigin === "boolean" ? { crossOrigin: c.crossOrigin } : {}),
    ...(typeof c.topOrigin === "string" ? { topOrigin: c.topOrigin } : {}),
  };
}

function gelijk(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Stappen 7–10 (registreren) en 11–14 (inloggen): type, challenge, origin, geen frame van elders. */
function controleerClientData(c: ClientData, verwacht: Verwacht, type: "webauthn.create" | "webauthn.get"): PasskeyReden | null {
  if (c.type !== type) return "type";
  // base64url zonder opvulling; een browser die toch "=" meestuurt, telt niet anders
  if (!verwacht.challenge || !gelijk(c.challenge.replace(/=+$/, ""), verwacht.challenge)) return "challenge";
  if (c.origin !== verwacht.origin) return "origin";
  if (c.crossOrigin === true || c.topOrigin !== undefined) return "cross_origin";
  return null;
}

/** Stappen 13–16 (registreren) en 15–18 (inloggen): ons domein, aanwezig, geverifieerd, vlaggen consistent. */
function controleerVlaggen(ad: AuthData, verwacht: Verwacht): PasskeyReden | null {
  const rpIdHash = sha256(verwacht.rpId);
  if (ad.rpIdHash.length !== 32 || !timingSafeEqual(ad.rpIdHash, rpIdHash)) return "rp_id";
  if (!ad.up) return "up";
  if (verwacht.uvVerplicht && !ad.uv) return "uv";
  if (!ad.be && ad.bs) return "be_bs";
  return null;
}

export interface RegistratieInvoer {
  clientDataJSON: Buffer;
  attestationObject: Buffer;
  /** rawId zoals de browser hem gaf; moet gelijk zijn aan de id in authenticatorData */
  rawId: Buffer;
}

export type RegistratieUitkomst =
  | {
      ok: true;
      credentialId: Buffer;
      /** de COSE-sleutel zoals het toestel hem gaf */
      publicKey: Buffer;
      algorithm: number;
      signCount: number;
      uv: boolean;
      backupEligible: boolean;
      backedUp: boolean;
      fmt: string;
    }
  | { ok: false; reden: PasskeyReden };

const weiger = (reden: PasskeyReden): { ok: false; reden: PasskeyReden } => ({ ok: false, reden });

/** §7.1: een nieuwe passkey controleren. */
export function verifieerRegistratie(inv: RegistratieInvoer, verwacht: Verwacht): RegistratieUitkomst {
  let c: ClientData;
  try {
    c = leesClientData(inv.clientDataJSON);
  } catch {
    return weiger("ongeldig");
  }
  const cd = controleerClientData(c, verwacht, "webauthn.create");
  if (cd) return weiger(cd);

  let fmt: CborWaarde;
  let authDataBuf: CborWaarde;
  let attStmt: CborWaarde;
  try {
    const att = alsMap(leesCborGeheel(inv.attestationObject), "attestationObject");
    fmt = att.get("fmt");
    authDataBuf = att.get("authData");
    attStmt = att.get("attStmt");
  } catch {
    return weiger("ongeldig");
  }
  if (typeof fmt !== "string" || !Buffer.isBuffer(authDataBuf) || !(attStmt instanceof Map)) return weiger("ongeldig");
  // "none" heeft per definitie een lege verklaring
  if (fmt === "none" && attStmt.size !== 0) return weiger("ongeldig");

  let ad: AuthData;
  try {
    ad = leesAuthData(authDataBuf);
  } catch {
    return weiger("ongeldig");
  }
  const vl = controleerVlaggen(ad, verwacht);
  if (vl) return weiger(vl);
  if (!ad.at || !ad.credential) return weiger("ongeldig");

  const { credentialId, publicKey } = ad.credential;
  // stap 25: hooguit 1023 bytes; een toestel maakt er minstens 16 (genoeg toeval)
  if (credentialId.length < 16 || credentialId.length > 1023) return weiger("credential_id");
  if (!inv.rawId.equals(credentialId)) return weiger("credential_id");

  let alg: number;
  try {
    alg = coseNaarSleutel(publicKey).alg;
  } catch {
    return weiger("sleutel");
  }
  // stap 19: een algoritme dat wij aanboden
  if (!(ONDERSTEUNDE_ALGORITMES as readonly number[]).includes(alg)) return weiger("sleutel");

  return {
    ok: true,
    credentialId,
    publicKey,
    algorithm: alg,
    signCount: ad.signCount,
    uv: ad.uv,
    backupEligible: ad.be,
    backedUp: ad.bs,
    fmt,
  };
}

export interface InlogInvoer {
  clientDataJSON: Buffer;
  authenticatorData: Buffer;
  signature: Buffer;
  /** user.id die het toestel bij deze passkey bewaarde (verplicht: we vragen geen e-mailadres vooraf) */
  userHandle: Buffer | null;
}

export interface OpgeslagenPasskey {
  publicKey: Buffer;
  algorithm: number;
  signCount: number;
  /** base64url van de user handle die we bij het registreren gaven */
  userHandle: string;
}

export type InlogUitkomst = { ok: true; signCount: number; uv: boolean; backedUp: boolean } | { ok: false; reden: PasskeyReden };

/** §7.2: een inlogpoging met een bekende passkey controleren. */
export function verifieerInlog(inv: InlogInvoer, opgeslagen: OpgeslagenPasskey, verwacht: Verwacht): InlogUitkomst {
  // stap 6: zonder e-mailadres vooraf moet de user handle er zijn en bij deze passkey horen
  if (!inv.userHandle || inv.userHandle.length === 0 || !gelijk(inv.userHandle.toString("base64url"), opgeslagen.userHandle)) {
    return weiger("user_handle");
  }

  let c: ClientData;
  try {
    c = leesClientData(inv.clientDataJSON);
  } catch {
    return weiger("ongeldig");
  }
  const cd = controleerClientData(c, verwacht, "webauthn.get");
  if (cd) return weiger(cd);

  let ad: AuthData;
  try {
    ad = leesAuthData(inv.authenticatorData);
  } catch {
    return weiger("ongeldig");
  }
  // bij inloggen hoort geen nieuwe sleutel in authenticatorData
  if (ad.at) return weiger("ongeldig");
  const vl = controleerVlaggen(ad, verwacht);
  if (vl) return weiger(vl);

  let sleutel: ReturnType<typeof coseNaarSleutel>;
  try {
    sleutel = coseNaarSleutel(opgeslagen.publicKey);
  } catch {
    return weiger("sleutel");
  }
  if (sleutel.alg !== opgeslagen.algorithm) return weiger("sleutel");

  // stap 20–21: handtekening over authenticatorData || sha256(clientDataJSON)
  const data = Buffer.concat([inv.authenticatorData, sha256(inv.clientDataJSON)]);
  if (!handtekeningKlopt(sleutel.alg, sleutel.sleutel, data, inv.signature)) return weiger("handtekening");

  // stap 22: de teller mag niet teruglopen of gelijk blijven, behalve als hij altijd 0 is
  // (gesynchroniseerde passkeys van Apple en Google tellen niet)
  if ((ad.signCount !== 0 || opgeslagen.signCount !== 0) && ad.signCount <= opgeslagen.signCount) return weiger("teller");

  return { ok: true, signCount: ad.signCount, uv: ad.uv, backedUp: ad.bs };
}
