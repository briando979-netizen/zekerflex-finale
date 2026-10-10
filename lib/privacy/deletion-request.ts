import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail, accountDeletionEmail } from "@/lib/mail";
import { fixedWindow } from "@/lib/rate-limit";
import { anonymizeUser, type ErasureReport } from "@/lib/privacy/anonymize";

// ---------------------------------------------------------------------------
// Self-service account deletion without being logged in — the Google Play
// "account deletion" web resource (and a general AVG art. 17 self-service
// path). Proves email ownership with a one-time mailed link, exactly like
// lib/auth/password-reset.ts proves it for a password reset, then runs the
// same anonymizeUser() the admin "Verwijder" action already uses.
// ---------------------------------------------------------------------------

const TTL_SECONDS = 60 * 60;

export async function requestAccountDeletion(rawEmail: string): Promise<void> {
  const email = rawEmail.toLowerCase().trim();

  const gate = await fixedWindow(`account-deletion:rl:${email}`, 1, 60);
  if (!gate.ok) return;

  const user = await prisma.user.findFirst({
    where: { email, disabledAt: null },
    select: { id: true, fullName: true, email: true },
  });
  // Silently succeed for unknown addresses — no enumeration.
  if (!user) return;

  const token = randomBytes(24).toString("base64url");
  await prisma.accountDeletionToken.create({
    data: { id: token, userId: user.id, expiresAt: new Date(Date.now() + TTL_SECONDS * 1000) },
  });

  const link = `${env.APP_BASE_URL.replace(/\/+$/, "")}/account-verwijderen/bevestigen?token=${token}`;
  const tpl = accountDeletionEmail(user.fullName, link);
  const res = await sendMail({ ...tpl, to: user.email }).catch(() => null);

  await recordAudit({
    category: "SECURITY",
    action: "privacy.deletion.requested",
    actorUserId: user.id,
    actorLabel: "user",
    summary: `Accountverwijdering aangevraagd voor ${user.email}`,
    targetType: "user",
    targetId: user.id,
  });
  logger.info("account deletion requested", { userId: user.id, delivered: res?.delivered });
}

async function consume(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  let rec: { userId: string; expiresAt: Date };
  try {
    rec = await prisma.accountDeletionToken.delete({ where: { id: token } });
  } catch {
    return null;
  }
  if (rec.expiresAt.getTime() < Date.now()) return null;
  return rec.userId;
}

/** True when the token is still valid — used to show the confirm form or an error. */
export async function isDeletionTokenValid(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return false;
  const rec = await prisma.accountDeletionToken.findUnique({
    where: { id: token },
    select: { expiresAt: true },
  });
  return Boolean(rec && rec.expiresAt.getTime() >= Date.now());
}

export interface ConfirmDeletionResult {
  ok: boolean;
  reason?: string;
  report?: ErasureReport;
}

export async function confirmAccountDeletion(token: string): Promise<ConfirmDeletionResult> {
  const userId = await consume(token);
  if (!userId) {
    return { ok: false, reason: "Deze link is verlopen of al gebruikt. Vraag een nieuwe aan." };
  }
  const report = await anonymizeUser(userId, { reason: "zelf verwijderd via publieke aanvraag" });
  return { ok: true, report };
}
