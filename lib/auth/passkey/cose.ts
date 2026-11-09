import { createPublicKey, verify, type KeyObject } from "node:crypto";
import { alsMap, leesCborGeheel, type CborWaarde } from "@/lib/auth/passkey/cbor";

// ---------------------------------------------------------------------------
// COSE-sleutel (RFC 9052/9053) → Node-sleutel, en de handtekening controleren.
// Drie algoritmes, de gangbare van passkeys en beveiligingssleutels:
//   -7   ES256  EC2, P-256, ECDSA met SHA-256 (handtekening in DER, zoals WebAuthn hem geeft)
//   -8   EdDSA  OKP, Ed25519
//   -257 RS256  RSA, PKCS#1 v1.5 met SHA-256 (Windows Hello)
// Een sleutel waarvan het type, de curve of de lengte niet bij het algoritme
// past, wordt geweigerd.
// ---------------------------------------------------------------------------

export const ES256 = -7;
export const EDDSA = -8;
export const RS256 = -257;
/** De algoritmes die we bij het aanmaken aanbieden, in volgorde van voorkeur. */
export const ONDERSTEUNDE_ALGORITMES = [ES256, EDDSA, RS256] as const;

// COSE-sleutelparameters
const KTY = 1;
const ALG = 3;
const CRV = -1; // EC2/OKP
const X = -2; // EC2/OKP
const Y = -3; // EC2
const RSA_N = -1;
const RSA_E = -2;

const KTY_OKP = 1;
const KTY_EC2 = 2;
const KTY_RSA = 3;
const CRV_P256 = 1;
const CRV_ED25519 = 6;

export class CoseFout extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoseFout";
  }
}

const b64u = (b: Buffer) => b.toString("base64url");

function bytes(m: Map<number | string, CborWaarde>, k: number, wat: string): Buffer {
  const v = m.get(k);
  if (!Buffer.isBuffer(v)) throw new CoseFout(`COSE-sleutel mist ${wat}`);
  return v;
}

function getal(m: Map<number | string, CborWaarde>, k: number, wat: string): number {
  const v = m.get(k);
  if (typeof v !== "number" || !Number.isInteger(v)) throw new CoseFout(`COSE-sleutel mist ${wat}`);
  return v;
}

/** Een COSE-sleutel (als CBOR-bytes of al gelezen map) omzetten naar een publieke Node-sleutel. */
export function coseNaarSleutel(cose: Buffer | Map<number | string, CborWaarde>): { sleutel: KeyObject; alg: number } {
  const m = Buffer.isBuffer(cose) ? alsMap(leesCborGeheel(cose), "COSE-sleutel") : cose;
  const kty = getal(m, KTY, "kty");
  const alg = getal(m, ALG, "alg");

  try {
    if (alg === ES256) {
      if (kty !== KTY_EC2 || getal(m, CRV, "crv") !== CRV_P256) throw new CoseFout("ES256 vraagt een P-256-sleutel");
      const x = bytes(m, X, "x");
      const y = bytes(m, Y, "y");
      if (x.length !== 32 || y.length !== 32) throw new CoseFout("P-256-coördinaten moeten 32 bytes zijn");
      return { alg, sleutel: createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(x), y: b64u(y) }, format: "jwk" }) };
    }
    if (alg === EDDSA) {
      if (kty !== KTY_OKP || getal(m, CRV, "crv") !== CRV_ED25519) throw new CoseFout("EdDSA vraagt een Ed25519-sleutel");
      const x = bytes(m, X, "x");
      if (x.length !== 32) throw new CoseFout("Ed25519-sleutel moet 32 bytes zijn");
      return { alg, sleutel: createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: b64u(x) }, format: "jwk" }) };
    }
    if (alg === RS256) {
      if (kty !== KTY_RSA) throw new CoseFout("RS256 vraagt een RSA-sleutel");
      const n = bytes(m, RSA_N, "n");
      const e = bytes(m, RSA_E, "e");
      if (n.length < 256) throw new CoseFout("RSA-sleutel is korter dan 2048 bits");
      return { alg, sleutel: createPublicKey({ key: { kty: "RSA", n: b64u(n), e: b64u(e) }, format: "jwk" }) };
    }
  } catch (err) {
    if (err instanceof CoseFout) throw err;
    // createPublicKey weigert bijv. een punt dat niet op de curve ligt
    throw new CoseFout("COSE-sleutel is geen geldige publieke sleutel");
  }
  throw new CoseFout(`algoritme ${alg} wordt niet ondersteund`);
}

/** Klopt de handtekening over `data` met deze sleutel? Gooit nooit: een kapotte handtekening is gewoon "nee". */
export function handtekeningKlopt(alg: number, sleutel: KeyObject, data: Buffer, handtekening: Buffer): boolean {
  try {
    if (alg === ES256) return verify("sha256", data, { key: sleutel, dsaEncoding: "der" }, handtekening);
    if (alg === RS256) return verify("sha256", data, sleutel, handtekening);
    if (alg === EDDSA) return verify(null, data, sleutel, handtekening);
    return false;
  } catch {
    return false;
  }
}
