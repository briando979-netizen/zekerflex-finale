import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail, passwordResetEmail } from "@/lib/mail";
import { fixedWindow } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Password reset. Tokens live in Postgres (PasswordResetToken), isolated from
// the e-mail-verification tokens. One-time use, 1 hour TTL. No user
// enumeration on the request step.
//
// Previously these tokens (and the request cooldown) lived on local disk / an
// in-process Map — both unreliable on Vercel's serverless functions, whose
// filesystem is read-only outside /tmp and whose /tmp is not shared across
// invocations, and whose process memory does not persist across cold starts.
// ---------------------------------------------------------------------------

const TTL_SECONDS = 60 * 60;

export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.toLowerCase().trim();

  // Redis-backed cooldown so the endpoint can't be used to blast mail — works
  // across every serverless instance, unlike an in-process Map.
  const gate = await fixedWindow(`password-reset:rl:${email}`, 1, 60);
  if (!gate.ok) return;

  const user = await prisma.user.findFirst({
    where: { email, disabledAt: null },
    select: { id: true, fullName: true, email: true, passwordHash: true },
  });
  // Silently succeed for unknown addresses or Google-only accounts.
  if (!user || !user.passwordHash) return;

  const token = randomBytes(24).toString("base64url");
  await prisma.passwordResetToken.create({
    data: { id: token, userId: user.id, expiresAt: new Date(Date.now() + TTL_SECONDS * 1000) },
  });

  const link = `${env.APP_BASE_URL.replace(/\/+$/, "")}/wachtwoord-herstellen?token=${token}`;
  const tpl = passwordResetEmail(user.fullName, link);
  const res = await sendMail({ ...tpl, to: user.email }).catch(() => null);

  await recordAudit({
    category: "SECURITY",
    action: "auth.password.reset_requested",
    actorUserId: user.id,
    actorLabel: "user",
    summary: `Wachtwoordherstel aangevraagd voor ${user.email}`,
    targetType: "user",
    targetId: user.id,
  });
  logger.info("password reset requested", { userId: user.id, delivered: res?.delivered });
}

export interface ResetResult {
  ok: boolean;
  reason?: string;
}

async function consume(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  // Atomic delete-and-return: a concurrent second use of the same token
  // (double-click, replay) finds nothing to delete and fails closed.
  let rec: { userId: string; expiresAt: Date };
  try {
    rec = await prisma.passwordResetToken.delete({ where: { id: token } });
  } catch {
    return null;
  }
  if (rec.expiresAt.getTime() < Date.now()) return null;
  return rec.userId;
}

/** True when the token is still valid — used to show the form or an error. */
export async function isResetTokenValid(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return false;
  const rec = await prisma.passwordResetToken.findUnique({
    where: { id: token },
    select: { expiresAt: true },
  });
  return Boolean(rec && rec.expiresAt.getTime() >= Date.now());
}

export async function completePasswordReset(token: string, newPassword: string): Promise<ResetResult> {
  if (newPassword.length < 8) {
    return { ok: false, reason: "Kies een wachtwoord van minstens 8 tekens." };
  }
  const userId = await consume(token);
  if (!userId) {
    return { ok: false, reason: "Deze herstellink is verlopen of al gebruikt. Vraag een nieuwe aan." };
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await recordAudit({
    category: "SECURITY",
    action: "auth.password.reset",
    severity: "warning",
    actorUserId: userId,
    actorLabel: "user",
    summary: "Wachtwoord opnieuw ingesteld via herstellink",
    targetType: "user",
    targetId: userId,
  });
  logger.info("password reset completed", { userId });
  return { ok: true };
}
