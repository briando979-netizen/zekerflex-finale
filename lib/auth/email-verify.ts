import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { sendMail, verificationEmail, welcomeEmail } from "@/lib/mail";
import { getFiscal } from "@/lib/fiscal/store";
import { mintToken, consumeToken, consumeCode, latestVerification } from "@/lib/mail/store";
import { fixedWindow, privateRateLimitIdentifier } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// E-mail address verification.
//
// Tokens live in the Postgres-backed mail store, and resend cooldowns use
// shared Redis so they apply across serverless instances. Verification mail
// goes through lib/mail (real SMTP when configured, captured in /admin/mail).
// ---------------------------------------------------------------------------

const TOKEN_TTL_SECONDS = 24 * 60 * 60;

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
  const gate = await fixedWindow(
    `email-verification:rl:${privateRateLimitIdentifier(userId)}`,
    1,
    45,
  );
  if (!gate.ok) {
    return {
      sent: false,
      link: "",
      delivered: false,
      transport: "mailbox",
      cooldownSeconds: gate.retryAfterSeconds || 45,
    };
  }

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
    select: { id: true, email: true, fullName: true, emailVerifiedAt: true, memberships: { select: { role: true } } },
  });
  if (!user) return { ok: false, reason: "Account niet gevonden." };
  if (!user.emailVerifiedAt) {
    // Only the first confirmation flips the flag — guards against a double welcome mail.
    const flipped = await prisma.user.updateMany({ where: { id: user.id, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
    logger.info("email verified", { userId: user.id });
    if (flipped.count === 1) await sendWelcome(user);
  }
  return { ok: true };
}

/** Welcome mail — sent once, right after the address is confirmed (not at sign-up). Best-effort. */
async function sendWelcome(user: { id: string; email: string; fullName: string; memberships: { role: string }[] }): Promise<void> {
  try {
    const freelancer = user.memberships.some((m) => m.role === "FREELANCER");
    const workerKind = freelancer ? ((await getFiscal(user.id).catch(() => null))?.workerKind ?? undefined) : undefined;
    const tpl = welcomeEmail(user.fullName, freelancer ? "freelancer" : "bedrijf", env.APP_BASE_URL, workerKind);
    await sendMail({ ...tpl, to: user.email });
  } catch (err) {
    logger.warn("welcome mail failed", { userId: user.id, error: (err as Error).message });
  }
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
  return markVerified(userId);
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
