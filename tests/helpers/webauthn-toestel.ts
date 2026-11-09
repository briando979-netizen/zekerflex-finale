import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

// ---------------------------------------------------------------------------
// Een nep-toestel (authenticator) voor de passkey-tests: maakt een echt
// sleutelpaar (ES256, Ed25519 of RS256) en bouwt authenticatorData,
// clientDataJSON en het attestationObject byte voor byte na zoals een browser
// dat doet (WebAuthn §6.1, §6.5, §5.8.1). Met een kleine CBOR-schrijver, los van
// de lezer die we testen.
// ---------------------------------------------------------------------------

export type Cbor = number | string | boolean | null | Buffer | Cbor[] | Map<number | string, Cbor>;

function kop(soort: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(soort << 5) | n]);
  if (n < 0x100) return Buffer.from([(soort << 5) | 24, n]);
  if (n < 0x10000) {
    const b = Buffer.alloc(3);
    b[0] = (soort << 5) | 25;
    b.writeUInt16BE(n, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = (soort << 5) | 26;
  b.writeUInt32BE(n, 1);
  return b;
}

export function cbor(v: Cbor): Buffer {
  if (typeof v === "number") return v >= 0 ? kop(0, v) : kop(1, -1 - v);
  if (typeof v === "string") {
    const b = Buffer.from(v, "utf8");
    return Buffer.concat([kop(3, b.length), b]);
  }
  if (typeof v === "boolean") return Buffer.from([v ? 0xf5 : 0xf4]);
  if (v === null) return Buffer.from([0xf6]);
  if (Buffer.isBuffer(v)) return Buffer.concat([kop(2, v.length), v]);
  if (Array.isArray(v)) return Buffer.concat([kop(4, v.length), ...v.map(cbor)]);
  const delen: Buffer[] = [kop(5, v.size)];
  for (const [k, w] of v) delen.push(cbor(k), cbor(w));
  return Buffer.concat(delen);
}

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest();

export type Soort = "es256" | "ed25519" | "rs256";

export interface Toestel {
  credentialId: Buffer;
  userHandle: Buffer;
  /** COSE-sleutel zoals hij in authenticatorData (en dus in de database) komt */
  cose: Buffer;
  alg: number;
  privateKey: KeyObject;
  teller: number;
}

export function nieuwToestel(soort: Soort = "es256"): Toestel {
  const credentialId = randomBytes(32);
  const userHandle = randomBytes(32);
  if (soort === "es256") {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = publicKey.export({ format: "jwk" });
    const cose = cbor(new Map<number, Cbor>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, "base64url")], [-3, Buffer.from(jwk.y!, "base64url")]]));
    return { credentialId, userHandle, cose, alg: -7, privateKey, teller: 0 };
  }
  if (soort === "ed25519") {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const jwk = publicKey.export({ format: "jwk" });
    const cose = cbor(new Map<number, Cbor>([[1, 1], [3, -8], [-1, 6], [-2, Buffer.from(jwk.x!, "base64url")]]));
    return { credentialId, userHandle, cose, alg: -8, privateKey, teller: 0 };
  }
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const cose = cbor(new Map<number, Cbor>([[1, 3], [3, -257], [-1, Buffer.from(jwk.n!, "base64url")], [-2, Buffer.from(jwk.e!, "base64url")]]));
  return { credentialId, userHandle, cose, alg: -257, privateKey, teller: 0 };
}

export interface Vlaggen {
  up?: boolean;
  uv?: boolean;
  be?: boolean;
  bs?: boolean;
}

function vlagByte(v: Vlaggen, at: boolean): number {
  return (v.up === false ? 0 : 0x01) | (v.uv === false ? 0 : 0x04) | (v.be ? 0x08 : 0) | (v.bs ? 0x10 : 0) | (at ? 0x40 : 0);
}

export function authData(opts: { rpId: string; vlaggen?: Vlaggen; teller: number; credential?: { id: Buffer; cose: Buffer } }): Buffer {
  const teller = Buffer.alloc(4);
  teller.writeUInt32BE(opts.teller >>> 0, 0);
  const delen = [sha(opts.rpId), Buffer.from([vlagByte(opts.vlaggen ?? {}, Boolean(opts.credential))]), teller];
  if (opts.credential) {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(opts.credential.id.length, 0);
    delen.push(Buffer.alloc(16), len, opts.credential.id, opts.credential.cose);
  }
  return Buffer.concat(delen);
}

export function clientData(c: { type: string; challenge: string; origin: string; crossOrigin?: boolean }): Buffer {
  return Buffer.from(JSON.stringify({ type: c.type, challenge: c.challenge, origin: c.origin, crossOrigin: c.crossOrigin ?? false }), "utf8");
}

export interface Ceremonie {
  rpId: string;
  origin: string;
  challenge: string;
  type?: string;
  vlaggen?: Vlaggen;
  crossOrigin?: boolean;
}

/** navigator.credentials.create: attestationObject (fmt "none") + clientDataJSON. */
export function registreer(t: Toestel, c: Ceremonie, extra: { fmt?: string; attStmt?: Map<number | string, Cbor>; teller?: number } = {}) {
  const clientDataJSON = clientData({ type: c.type ?? "webauthn.create", challenge: c.challenge, origin: c.origin, ...(c.crossOrigin ? { crossOrigin: true } : {}) });
  const ad = authData({ rpId: c.rpId, vlaggen: c.vlaggen ?? {}, teller: extra.teller ?? 0, credential: { id: t.credentialId, cose: t.cose } });
  const attestationObject = cbor(new Map<string, Cbor>([["fmt", extra.fmt ?? "none"], ["attStmt", extra.attStmt ?? new Map()], ["authData", ad]]));
  return { clientDataJSON, attestationObject, rawId: t.credentialId };
}

/** navigator.credentials.get: authenticatorData + clientDataJSON + handtekening. Verhoogt de teller als `teller` gezet is. */
export function meldAan(t: Toestel, c: Ceremonie, extra: { teller?: number; sleutel?: KeyObject; userHandle?: Buffer | null } = {}) {
  const clientDataJSON = clientData({ type: c.type ?? "webauthn.get", challenge: c.challenge, origin: c.origin, ...(c.crossOrigin ? { crossOrigin: true } : {}) });
  const authenticatorData = authData({ rpId: c.rpId, vlaggen: c.vlaggen ?? {}, teller: extra.teller ?? t.teller });
  const data = Buffer.concat([authenticatorData, sha(clientDataJSON)]);
  const sleutel = extra.sleutel ?? t.privateKey;
  const algo = t.alg === -8 ? null : "sha256";
  const signature = sign(algo, data, sleutel);
  return { clientDataJSON, authenticatorData, signature, userHandle: extra.userHandle === undefined ? t.userHandle : extra.userHandle };
}

/** Het antwoord zoals de browser het als JSON naar de server stuurt (lib/auth/passkey/browser.ts). */
export function inlogJson(t: Toestel, a: ReturnType<typeof meldAan>) {
  const b = (x: Buffer) => x.toString("base64url");
  return {
    id: b(t.credentialId),
    rawId: b(t.credentialId),
    type: "public-key",
    response: { clientDataJSON: b(a.clientDataJSON), authenticatorData: b(a.authenticatorData), signature: b(a.signature), userHandle: a.userHandle ? b(a.userHandle) : null },
  };
}

export function registratieJson(r: ReturnType<typeof registreer>) {
  const b = (x: Buffer) => x.toString("base64url");
  return { id: b(r.rawId), rawId: b(r.rawId), type: "public-key" as const, response: { clientDataJSON: b(r.clientDataJSON), attestationObject: b(r.attestationObject), transports: ["internal", "hybrid", "onzin"] } };
}
