import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail, passwordResetEmail } from "@/lib/mail";

// ---------------------------------------------------------------------------
// Password reset. Tokens live on disk, isolated from the e-mail-verification
// tokens: storage/auth/reset/<token>.json  ->  { userId, exp }
// One-time use, 1 hour TTL. No user enumeration on the request step.
// ---------------------------------------------------------------------------

const TTL_SECONDS = 60 * 60;

function dir(): string {
  return join(process.cwd(), "storage", "auth", "reset");
}

// in-process cooldown so the endpoint can't be used to blast mail
const cooldown = new Map<string, number>();

export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.toLowerCase().trim();
  const now = Date.now();
  if ((cooldown.get(email) ?? 0) > now) return;
  cooldown.set(email, now + 60_000);

  const user = await prisma.user.findFirst({
    where: { email, disabledAt: null },
    select: { id: true, fullName: true, email: true, passwordHash: true },
  });
  // Silently succeed for unknown addresses or Google-only accounts.
  if (!user || !user.passwordHash) return;

  await mkdir(dir(), { recursive: true });
  await pruneExpired();
  const token = randomBytes(24).toString("base64url");
  await writeFile(
    join(dir(), `${token}.json`),
    JSON.stringify({ userId: user.id, exp: now + TTL_SECONDS * 1000 }),
    "utf8",
  );

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
  const path = join(dir(), `${token}.json`);
  if (!existsSync(path)) return null;
  try {
    const rec = JSON.parse(await readFile(path, "utf8")) as { userId: string; exp: number };
    await unlink(path).catch(() => undefined);
    if (rec.exp < Date.now()) return null;
    return rec.userId;
  } catch {
    return null;
  }
}

/** True when the token is still valid — used to show the form or an error. */
export async function isResetTokenValid(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !existsSync(join(dir(), `${token}.json`))) return false;
  try {
    const rec = JSON.parse(await readFile(join(dir(), `${token}.json`), "utf8")) as { exp: number };
    return rec.exp >= Date.now();
  } catch {
    return false;
  }
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

async function pruneExpired(): Promise<void> {
  try {
    for (const f of (await readdir(dir())).filter((x) => x.endsWith(".json"))) {
      try {
        const rec = JSON.parse(await readFile(join(dir(), f), "utf8")) as { exp: number };
        if (rec.exp < Date.now()) await unlink(join(dir(), f)).catch(() => undefined);
      } catch {
        /* skip */
      }
    }
  } catch {
    /* dir may not exist */
  }
}
