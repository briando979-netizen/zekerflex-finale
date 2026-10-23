import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { recordAudit } from "@/lib/audit";
import { newTotpSecret, otpauthUrl, verifyTotp } from "@/lib/auth/totp";

// ---------------------------------------------------------------------------
// Two-step verification per user. The TOTP secret is sealed (AES-256-GCM,
// key derived from AUTH_SECRET); recovery codes are stored only as SHA-256
// hashes and work once. A used time-step can't be replayed.
// ---------------------------------------------------------------------------

interface Record2fa {
  secret: string | null; // sealed, active
  pending: string | null; // sealed, during setup
  enabledAt: string | null;
  recovery: string[]; // sha256 hex of unused recovery codes
  lastCounter: number;
}

const key = (userId: string) => `auth-2fa:${userId}`;
const SEAL = "totp-secret";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const normalizeRecovery = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

async function load(userId: string): Promise<Record2fa> {
  return (await kvGet<Record2fa>(key(userId))) ?? { secret: null, pending: null, enabledAt: null, recovery: [], lastCounter: 0 };
}

export async function twoFactorStatus(userId: string): Promise<{ enabled: boolean; enabledAt: string | null; recoveryLeft: number }> {
  const r = await load(userId);
  return { enabled: Boolean(r.secret && r.enabledAt), enabledAt: r.enabledAt, recoveryLeft: r.recovery.length };
}

export async function hasTwoFactor(userId: string): Promise<boolean> {
  return (await twoFactorStatus(userId)).enabled;
}

/** Start (or restart) setup: a fresh secret the user scans; not active until confirmed. */
export async function beginTwoFactorSetup(userId: string, email: string): Promise<{ secret: string; otpauth: string }> {
  const r = await load(userId);
  const secret = newTotpSecret();
  await kvSet(key(userId), { ...r, pending: sealSecret(secret, SEAL) });
  return { secret, otpauth: otpauthUrl(secret, email) };
}

function newRecoveryCodes(): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: 10 }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { plain, hashes: plain.map((c) => sha(normalizeRecovery(c))) };
}

/** Confirm setup with a code from the app → active; returns the one-time recovery codes. */
export async function confirmTwoFactorSetup(userId: string, code: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false }> {
  const r = await load(userId);
  if (!r.pending) return { ok: false };
  const secret = openSecret(r.pending, SEAL);
  const counter = verifyTotp(secret, code);
  if (counter === null) return { ok: false };
  const { plain, hashes } = newRecoveryCodes();
  await kvSet(key(userId), { secret: r.pending, pending: null, enabledAt: new Date().toISOString(), recovery: hashes, lastCounter: counter });
  await recordAudit({ category: "SECURITY", action: "auth.2fa.enabled", actorUserId: userId, actorLabel: "user", summary: "Tweestapsverificatie aangezet", targetType: "user", targetId: userId });
  return { ok: true, recoveryCodes: plain };
}

/**
 * Check a second factor: a current authenticator code (not replayed), or an
 * unused recovery code (then consumed).
 */
export async function verifySecondFactor(userId: string, code: string): Promise<{ ok: boolean; usedRecovery?: boolean }> {
  const r = await load(userId);
  if (!r.secret || !r.enabledAt) return { ok: false };
  const counter = verifyTotp(openSecret(r.secret, SEAL), code);
  if (counter !== null) {
    if (counter <= r.lastCounter) return { ok: false }; // already used — replay
    await kvSet(key(userId), { ...r, lastCounter: counter });
    return { ok: true };
  }
  const h = sha(normalizeRecovery(code));
  const hit = r.recovery.find((x) => x.length === h.length && timingSafeEqual(Buffer.from(x), Buffer.from(h)));
  if (!hit) return { ok: false };
  await kvSet(key(userId), { ...r, recovery: r.recovery.filter((x) => x !== hit) });
  await recordAudit({ category: "SECURITY", action: "auth.2fa.recovery_used", severity: "warning", actorUserId: userId, actorLabel: "user", summary: `Herstelcode gebruikt om in te loggen (${r.recovery.length - 1} over)`, targetType: "user", targetId: userId });
  return { ok: true, usedRecovery: true };
}

export async function regenerateRecoveryCodes(userId: string, code: string): Promise<string[] | null> {
  if (!(await verifySecondFactor(userId, code)).ok) return null;
  const r = await load(userId);
  const { plain, hashes } = newRecoveryCodes();
  await kvSet(key(userId), { ...r, recovery: hashes });
  await recordAudit({ category: "SECURITY", action: "auth.2fa.recovery_regenerated", actorUserId: userId, actorLabel: "user", summary: "Nieuwe herstelcodes aangemaakt", targetType: "user", targetId: userId });
  return plain;
}

/** Turning it off needs a valid code — a stolen session alone can't remove 2FA. */
export async function disableTwoFactor(userId: string, code: string): Promise<boolean> {
  if (!(await verifySecondFactor(userId, code)).ok) return false;
  await kvDelete(key(userId));
  await recordAudit({ category: "SECURITY", action: "auth.2fa.disabled", severity: "warning", actorUserId: userId, actorLabel: "user", summary: "Tweestapsverificatie uitgezet", targetType: "user", targetId: userId });
  return true;
}

/** Admin reset (lost phone + lost recovery codes) — audited. */
export async function adminResetTwoFactor(targetUserId: string, adminUserId: string): Promise<void> {
  await kvDelete(key(targetUserId));
  await recordAudit({ category: "SECURITY", action: "auth.2fa.admin_reset", severity: "warning", actorUserId: adminUserId, actorLabel: "user", summary: "Tweestapsverificatie van een gebruiker gereset door een beheerder", targetType: "user", targetId: targetUserId });
}

// ---- login challenge: proves the password step for 5 minutes ----------------
const CHALLENGE = "2fa-login-challenge";
const CHALLENGE_TTL_MS = 10 * 60_000;

export function mintLoginChallenge(email: string, now = Date.now()): string {
  return sealSecret(JSON.stringify({ email: email.toLowerCase(), exp: now + CHALLENGE_TTL_MS }), CHALLENGE);
}

export function openLoginChallenge(token: string, now = Date.now()): string | null {
  try {
    const { email, exp } = JSON.parse(openSecret(token, CHALLENGE)) as { email: string; exp: number };
    return typeof email === "string" && exp > now ? email : null;
  } catch {
    return null;
  }
}
