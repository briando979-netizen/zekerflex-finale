import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { sendMail, verificationEmail } from "@/lib/mail";
import { mintToken, consumeToken, consumeCode, latestVerification } from "@/lib/mail/store";

// ---------------------------------------------------------------------------
// E-mail address verification.
//
// Tokens live on disk (storage/mail/tokens) — no Redis, no database schema
// change. The verification e-mail goes through lib/mail (real SMTP when
// configured, always captured in the local mailbox at /admin/mail).
// ---------------------------------------------------------------------------

const TOKEN_TTL_SECONDS = 24 * 60 * 60;
const cooldown = new Map<string, number>(); // userId -> earliest next send (ms), in-process only

export async function isEmailVerified(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true },
  });
  return Boolean(u?.emailVerifiedAt);
}

export interface SendVerificationResult {
  sent: boolean;
  link: string;
  code?: string;
  delivered: boolean;
  transport: "smtp" | "mailbox";
  cooldownSeconds?: number;
}

export async function sendVerificationEmail(
  userId: string,
  email: string,
  fullName: string,
): Promise<SendVerificationResult> {
  const now = Date.now();
  const until = cooldown.get(userId) ?? 0;
  if (until > now) {
    return { sent: false, link: "", delivered: false, transport: "mailbox", cooldownSeconds: Math.ceil((until - now) / 1000) };
  }
  cooldown.set(userId, now + 45_000);

  const { token, code } = await mintToken(userId, TOKEN_TTL_SECONDS);
  const link = `${env.APP_BASE_URL}/verifieer-email?token=${token}`;

  const tpl = verificationEmail(fullName, link, code);
  const res = await sendMail({ ...tpl, to: email });

  return { sent: true, link, code, delivered: res.delivered, transport: res.transport };
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

async function markVerified(userId: string): Promise<VerifyResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!user) return { ok: false, reason: "Account niet gevonden." };
  if (!user.emailVerifiedAt) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    logger.info("email verified", { userId: user.id });
  }
  return { ok: true };
}

/** Confirm the account with the 6-digit code from the verification e-mail. */
export async function confirmVerificationCode(userId: string, code: string): Promise<VerifyResult> {
  const matched = await consumeCode(userId, code.replace(/\s+/g, ""));
  if (!matched) {
    return { ok: false, reason: "Die code klopt niet of is verlopen. Vraag een nieuwe aan." };
  }
  return markVerified(matched);
}

export async function confirmVerificationToken(token: string): Promise<VerifyResult> {
  const userId = await consumeToken(token);
  if (!userId) {
    return { ok: false, reason: "Deze verificatielink is verlopen of al gebruikt." };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!user) return { ok: false, reason: "Account niet gevonden." };

  if (!user.emailVerifiedAt) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
    logger.info("email verified", { userId: user.id });
  }
  return { ok: true };
}

/** The most recent still-valid link + code for a user (shown on the verify page locally). */
export async function currentVerification(
  userId: string,
): Promise<{ link: string; code: string | null } | null> {
  const v = await latestVerification(userId);
  if (!v) return null;
  return { link: `${env.APP_BASE_URL}/verifieer-email?token=${v.token}`, code: v.code };
}

/** The most recent still-valid link for a user (shown on the verify page locally). */
export async function currentVerificationLink(userId: string): Promise<string | null> {
  return (await currentVerification(userId))?.link ?? null;
}
