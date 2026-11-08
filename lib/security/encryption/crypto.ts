import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64; // 512 bits

export class EncryptionManager {
  private masterKey: Buffer;

  constructor(masterKeyHex: string) {
    if (masterKeyHex.length !== KEY_LENGTH * 2) {
      throw new Error("Invalid master key length");
    }
    this.masterKey = Buffer.from(masterKeyHex, "hex");
  }

  static generateMasterKey(): string {
    return crypto.randomBytes(KEY_LENGTH).toString("hex");
  }

  encryptField(plaintext: string, associatedData?: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);

    if (associatedData) {
      cipher.setAAD(Buffer.from(associatedData));
    }

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();
    const result = iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;

    return result;
  }

  decryptField(ciphertext: string, associatedData?: string): string | null {
    try {
      const parts = ciphertext.split(":");
      if (parts.length !== 3) return null;

      const iv = Buffer.from(parts[0], "hex");
      const authTag = Buffer.from(parts[1], "hex");
      const encrypted = parts[2];

      const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
      decipher.setAuthTag(authTag);

      if (associatedData) {
        decipher.setAAD(Buffer.from(associatedData));
      }

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch {
      return null;
    }
  }

  rotateKey(newMasterKeyHex: string): {
    oldKey: string;
    newKey: string;
    strategy: "in-place" | "dual-write" | "background";
  } {
    return {
      oldKey: this.masterKey.toString("hex"),
      newKey: newMasterKeyHex,
      strategy: "dual-write", // Read old, write new; background job re-encrypts
    };
  }

  derivedKeyForUser(userId: string): Buffer {
    const hmac = crypto.createHmac("sha256", this.masterKey);
    hmac.update(userId);
    return hmac.digest();
  }

  secureRandomBytes(length: number): string {
    return crypto.randomBytes(length).toString("hex");
  }

  hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const useSalt = salt || crypto.randomBytes(SALT_LENGTH).toString("hex");
    const hash = crypto
      .pbkdf2Sync(password, useSalt, 100000, 32, "sha256")
      .toString("hex");
    return { hash, salt: useSalt };
  }

  verifyPassword(password: string, hash: string, salt: string): boolean {
    const computed = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  }

  signData(data: string, secret?: string): string {
    const hmac = crypto.createHmac("sha256", secret || this.masterKey);
    hmac.update(data);
    return hmac.digest("hex");
  }

  verifySignature(data: string, signature: string, secret?: string): boolean {
    const computed = this.signData(data, secret);
    try {
      return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  generateECDSAKeyPair(): { privateKey: string; publicKey: string } {
    const keyPair = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    return {
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
    };
  }

  signWithECDSA(data: string, privateKey: string): string {
    const sign = crypto.createSign("SHA256");
    sign.update(data);
    return sign.sign(privateKey, "hex");
  }

  verifyECDSASignature(data: string, signature: string, publicKey: string): boolean {
    try {
      const verify = crypto.createVerify("SHA256");
      verify.update(data);
      return verify.verify(publicKey, signature, "hex");
    } catch {
      return false;
    }
  }

  encryptAsymmetric(plaintext: string, publicKey: string): string {
    const buffer = Buffer.from(plaintext, "utf8");
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      },
      buffer
    );
    return encrypted.toString("hex");
  }

  decryptAsymmetric(ciphertext: string, privateKey: string): string | null {
    try {
      const buffer = Buffer.from(ciphertext, "hex");
      const decrypted = crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        buffer
      );
      return decrypted.toString("utf8");
    } catch {
      return null;
    }
  }
}

export function generateHSMCompatibleKey(): string {
  // Generate key that can be imported to HSM
  return crypto.randomBytes(KEY_LENGTH).toString("hex");
}

export async function rotateKeysInPlace(
  oldEncryption: EncryptionManager,
  newEncryption: EncryptionManager,
  encryptedRecords: string[]
): Promise<string[]> {
  // Re-encrypt all records with new key
  const newRecords: string[] = [];

  for (const encrypted of encryptedRecords) {
    const plaintext = oldEncryption.decryptField(encrypted);
    if (plaintext) {
      newRecords.push(newEncryption.encryptField(plaintext));
    }
  }

  return newRecords;
}
