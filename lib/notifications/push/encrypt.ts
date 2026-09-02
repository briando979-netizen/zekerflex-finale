import {
  createCipheriv,
  createDecipheriv,
  createECDH,
  hkdfSync,
  randomBytes,
} from "node:crypto";

// ---------------------------------------------------------------------------
// Web Push payload encryption - RFC 8291 (aes128gcm) + RFC 8188 framing.
//
// Pure Node crypto, zero dependencies. The platform generates an ephemeral
// ECDH P-256 keypair per message, derives the content-encryption key from the
// shared secret + the subscription's auth secret, and emits a single
// aes128gcm record. `serverKeys` / `salt` are injectable so the RFC test
// vectors and a round-trip test can pin the implementation.
// ---------------------------------------------------------------------------

const KEY_LENGTH = 16;
const NONCE_LENGTH = 12;
const RECORD_SIZE = 4096;
const SALT_LENGTH = 16;

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, salt, info, length));
}

export interface EncryptOptions {
  /** Cleartext payload (already JSON-stringified). */
  payload: Buffer;
  /** Subscription public key (`p256dh`), 65-byte uncompressed point. */
  clientPublicKey: Buffer;
  /** Subscription auth secret (`auth`), 16 bytes. */
  authSecret: Buffer;
  /** Test injection - 16-byte salt. Random when omitted. */
  salt?: Buffer;
  /** Test injection - fixed server ECDH keypair. Ephemeral when omitted. */
  serverKeys?: { publicKey: Buffer; privateKey: Buffer };
}

/** Generate an ephemeral P-256 keypair for a single Web Push message. */
export function generateServerKeys(): { publicKey: Buffer; privateKey: Buffer } {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: ecdh.getPublicKey(), privateKey: ecdh.getPrivateKey() };
}

function deriveKeys(
  clientPublicKey: Buffer,
  authSecret: Buffer,
  serverPublicKey: Buffer,
  sharedSecret: Buffer,
  salt: Buffer,
): { cek: Buffer; nonce: Buffer } {
  // RFC 8291 s3.4: IKM from the ECDH secret keyed by the auth secret.
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    clientPublicKey,
    serverPublicKey,
  ]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);

  // RFC 8188 s2.2: content-encryption key + nonce keyed by the record salt.
  const cek = hkdf(
    salt,
    ikm,
    Buffer.from("Content-Encoding: aes128gcm\0"),
    KEY_LENGTH,
  );
  const nonce = hkdf(
    salt,
    ikm,
    Buffer.from("Content-Encoding: nonce\0"),
    NONCE_LENGTH,
  );
  return { cek, nonce };
}

export function encryptPayload(opts: EncryptOptions): Buffer {
  if (opts.clientPublicKey.length !== 65) {
    throw new Error("clientPublicKey must be a 65-byte uncompressed P-256 point");
  }
  if (opts.authSecret.length !== 16) {
    throw new Error("authSecret must be 16 bytes");
  }

  const salt = opts.salt ?? randomBytes(SALT_LENGTH);
  const server = opts.serverKeys ?? generateServerKeys();

  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(server.privateKey);
  const sharedSecret = ecdh.computeSecret(opts.clientPublicKey);

  const { cek, nonce } = deriveKeys(
    opts.clientPublicKey,
    opts.authSecret,
    server.publicKey,
    sharedSecret,
    salt,
  );

  // Single record: plaintext || 0x02 (last-record delimiter), then AES-128-GCM.
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(opts.payload),
    cipher.update(Buffer.from([0x02])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  // RFC 8188 header: salt(16) | rs(4, big-endian) | idlen(1) | keyid(idlen).
  const header = Buffer.alloc(SALT_LENGTH + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, SALT_LENGTH);
  header.writeUInt8(server.publicKey.length, SALT_LENGTH + 4);

  return Buffer.concat([header, server.publicKey, ciphertext]);
}

/**
 * Inverse of {@link encryptPayload}, using the subscription's private key.
 * Only used by the test round-trip - the platform never receives push bodies.
 */
export function decryptPayload(
  body: Buffer,
  clientKeys: { publicKey: Buffer; privateKey: Buffer },
  authSecret: Buffer,
): Buffer {
  const salt = body.subarray(0, SALT_LENGTH);
  const idlen = body.readUInt8(SALT_LENGTH + 4);
  const serverPublicKey = body.subarray(
    SALT_LENGTH + 5,
    SALT_LENGTH + 5 + idlen,
  );
  const ciphertext = body.subarray(SALT_LENGTH + 5 + idlen);

  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(clientKeys.privateKey);
  const sharedSecret = ecdh.computeSecret(serverPublicKey);

  const { cek, nonce } = deriveKeys(
    clientKeys.publicKey,
    authSecret,
    serverPublicKey,
    sharedSecret,
    salt,
  );

  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);

  // Strip the RFC 8188 padding delimiter (0x02 for the last record).
  let end = plain.length;
  while (end > 0 && plain[end - 1] === 0x00) end -= 1;
  if (end > 0 && (plain[end - 1] === 0x01 || plain[end - 1] === 0x02)) end -= 1;
  return plain.subarray(0, end);
}
