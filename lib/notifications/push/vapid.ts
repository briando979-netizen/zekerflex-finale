import { createECDH } from "node:crypto";
import { SignJWT, importJWK } from "jose";

// ---------------------------------------------------------------------------
// VAPID (RFC 8292) - the platform authenticates itself to the push service
// with a short-lived ES256 JWT signed by its own keypair. No third-party
// account: `npm run vapid:keys` mints the pair, it lives in the env.
// ---------------------------------------------------------------------------

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 point. */
  publicKey: string;
  /** base64url, 32-byte scalar. */
  privateKey: string;
}

/**
 * De geheime sleutel als precies 32 bytes. Node's ecdh.getPrivateKey() laat voorloopnullen weg, dus ongeveer één op
 * de 256 sleutels kwam als 31 bytes terug en werd dan geweigerd (15 nov: de controle viel er willekeurig op om; een
 * sleutel in de omgeving die zo was gemaakt, had alle pushmeldingen stilgelegd). Links aanvullen met nullen is
 * hetzelfde getal.
 */
export function tot32Bytes(priv: Buffer): Buffer {
  return priv.length >= 32 ? priv : Buffer.concat([Buffer.alloc(32 - priv.length), priv]);
}

/** Mint a fresh VAPID keypair (used by scripts/vapid-keys.mjs and tests). */
export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    privateKey: tot32Bytes(ecdh.getPrivateKey()).toString("base64url"),
  };
}

async function importVapidKey(keys: VapidKeys) {
  const pub = Buffer.from(keys.publicKey, "base64url");
  const ruw = Buffer.from(keys.privateKey, "base64url");
  if (pub.length !== 65) throw new Error("VAPID public key must be 65 bytes");
  if (ruw.length < 1 || ruw.length > 32) throw new Error("VAPID private key must be 32 bytes");
  const priv = tot32Bytes(ruw);
  return importJWK(
    {
      kty: "EC",
      crv: "P-256",
      x: pub.subarray(1, 33).toString("base64url"),
      y: pub.subarray(33, 65).toString("base64url"),
      d: priv.toString("base64url"),
    },
    "ES256",
  );
}

/**
 * Build the `Authorization: vapid t=<jwt>, k=<pubkey>` header value for a
 * request to `audience` (the scheme+host of the push endpoint).
 */
export async function vapidAuthorization(opts: {
  audience: string;
  subject: string;
  keys: VapidKeys;
  ttlSeconds?: number;
}): Promise<string> {
  const key = await importVapidKey(opts.keys);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setAudience(opts.audience)
    .setSubject(opts.subject)
    .setIssuedAt(now)
    .setExpirationTime(now + (opts.ttlSeconds ?? 12 * 60 * 60))
    .sign(key);
  return `vapid t=${jwt}, k=${opts.keys.publicKey}`;
}
