import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { mailAllowed } from "@/lib/mail/prefs";

// ---------------------------------------------------------------------------
// Do-not-contact list for the sales-recruiter motor.
//
// A recipient is suppressed when ANY of these hold:
//   1. an explicit SalesSuppression row (manual, bounce, unsubscribe, complaint)
//   2. they opted out of the "sales-outreach" mail category (mail/prefs.ts)
//   3. their e-mail domain already belongs to a ZekerFlex account / tenant
//      (they're already a customer — don't cold-mail them)
//
// Checked at BOTH draft time and send time so a late opt-out still stops a mail.
// ---------------------------------------------------------------------------

export type SuppressionReason =
  | "manual"
  | "bounce"
  | "unsubscribe"
  | "complaint"
  | "existing-customer"
  | "category-opt-out";

export interface SuppressionResult {
  blocked: boolean;
  reason?: SuppressionReason;
  detail?: string;
}

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.nl", "outlook.com",
  "outlook.nl", "live.nl", "live.com", "icloud.com", "me.com", "yahoo.com",
  "yahoo.nl", "ziggo.nl", "kpnmail.nl", "planet.nl", "home.nl", "xs4all.nl",
  "telfort.nl", "casema.nl", "chello.nl", "hetnet.nl", "upcmail.nl", "quicknet.nl",
  "zonnet.nl", "proton.me", "protonmail.com", "gmx.com", "gmx.net",
]);

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function domainOf(email: string): string | null {
  const at = normaliseEmail(email).lastIndexOf("@");
  if (at === -1) return null;
  const d = normaliseEmail(email).slice(at + 1);
  return d.includes(".") ? d : null;
}

export async function isSuppressed(emailRaw: string): Promise<SuppressionResult> {
  const email = normaliseEmail(emailRaw);
  if (!email || !email.includes("@")) {
    return { blocked: true, reason: "manual", detail: "ongeldig e-mailadres" };
  }

  // 1. explicit row
  const row = await prisma.salesSuppression.findUnique({ where: { email } }).catch(() => null);
  if (row) {
    return { blocked: true, reason: row.reason as SuppressionReason, detail: "op de onderdrukkingslijst" };
  }

  // 2. category opt-out
  const allowed = await mailAllowed(email, "sales-outreach").catch(() => true);
  if (!allowed) {
    return { blocked: true, reason: "category-opt-out", detail: "afgemeld voor zakelijke introducties" };
  }

  // 3. already a customer (exact account match or a business-domain match)
  const domain = domainOf(email);
  try {
    const exact = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exact) return { blocked: true, reason: "existing-customer", detail: "heeft al een ZekerFlex-account" };

    if (domain && !FREE_MAIL_DOMAINS.has(domain)) {
      const sameDomain = await prisma.user.findFirst({
        where: { email: { endsWith: `@${domain}` }, disabledAt: null },
        select: { id: true },
      });
      if (sameDomain) {
        return { blocked: true, reason: "existing-customer", detail: `domein ${domain} is al klant` };
      }
    }
  } catch (err) {
    logger.warn("suppression customer-check failed (allowing)", { error: (err as Error).message });
  }

  return { blocked: false };
}

export async function addSuppression(
  emailRaw: string,
  reason: SuppressionReason,
  createdById?: string | null,
): Promise<void> {
  const email = normaliseEmail(emailRaw);
  if (!email.includes("@")) return;
  await prisma.salesSuppression
    .upsert({
      where: { email },
      create: { email, domain: domainOf(email), reason, createdById: createdById ?? null },
      update: { reason },
    })
    .catch((err) => logger.warn("addSuppression failed", { error: (err as Error).message }));
  await recordAudit({
    category: "SALES",
    action: "sales.suppression.added",
    ...(createdById ? { actorUserId: createdById } : {}),
    actorLabel: createdById ? "user" : "sales-ai",
    summary: `E-mailadres op onderdrukkingslijst (${reason}): ${email}`,
    targetType: "salesSuppression",
    targetId: email,
  });
}

export async function removeSuppression(emailRaw: string, actorUserId?: string): Promise<void> {
  const email = normaliseEmail(emailRaw);
  await prisma.salesSuppression.delete({ where: { email } }).catch(() => undefined);
  await recordAudit({
    category: "SALES",
    action: "sales.suppression.removed",
    ...(actorUserId ? { actorUserId } : {}),
    actorLabel: "user",
    summary: `E-mailadres van onderdrukkingslijst gehaald: ${email}`,
    targetType: "salesSuppression",
    targetId: email,
  });
}

export async function listSuppression(limit = 500) {
  return prisma.salesSuppression.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
