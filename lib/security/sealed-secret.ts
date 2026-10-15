import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// AES-256-GCM for secrets the platform must be able to read back, such as a
// connected mailbox's app password. The key is derived per purpose from
// AUTH_SECRET: a leaked database alone reveals nothing, and a ciphertext
// sealed for one purpose won't open as another. Rotating AUTH_SECRET makes
// stored secrets unreadable — the owner reconnects.
// ---------------------------------------------------------------------------

function keyFor(purpose: string): Buffer {
  return createHash("sha256").update(`zf-sealed:${purpose}:${env.AUTH_SECRET}`).digest();
}

export function sealSecret(plain: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(purpose), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function openSecret(sealed: string, purpose: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || body === undefined) throw new Error("sealed secret: unknown format");
  const decipher = createDecipheriv("aes-256-gcm", keyFor(purpose), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
