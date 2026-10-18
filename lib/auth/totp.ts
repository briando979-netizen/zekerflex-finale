import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// TOTP (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits) — the codes shown by
// Google Authenticator, Microsoft Authenticator, 1Password, Authy, … Pure
// node:crypto, no dependency for the security-critical part.
// ---------------------------------------------------------------------------

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error("ongeldige base32-tekens");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit random secret, base32 — what the authenticator app stores. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin = ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(bin % 1_000_000).padStart(6, "0");
}

export const counterAt = (ms: number) => Math.floor(ms / 1000 / TOTP_STEP_SECONDS);

/**
 * The matching time-step counter for `code`, or null. Accepts one step either
 * side (±30 s) for clock drift. Constant-time comparison per candidate.
 */
export function verifyTotp(secret: string, code: string, now = Date.now(), window = 1): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const want = Buffer.from(clean);
  const base = counterAt(now);
  for (let d = -window; d <= window; d++) {
    const got = Buffer.from(totpAt(secret, base + d));
    if (timingSafeEqual(got, want)) return base + d;
  }
  return null;
}

/** otpauth:// link — scanned as a QR code, or tapped on a phone to add the account. */
export function otpauthUrl(secret: string, account: string, issuer = "ZekerFlex"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const q = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: String(TOTP_STEP_SECONDS) });
  return `otpauth://totp/${label}?${q.toString()}`;
}
