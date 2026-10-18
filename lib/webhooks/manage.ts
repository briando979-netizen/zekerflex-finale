import { createHmac, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { encryptWebhookSecret, decryptWebhookSecret } from "@/lib/webhooks/crypto";

// ---------------------------------------------------------------------------
// Employer self-service for outgoing webhooks: add endpoints, pick events,
// rotate the signing secret (shown once), pause, test and read the delivery
// log. URLs must be public https — never an internal address the server
// itself could reach (SSRF).
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENTS = [
  { key: "shift.matched", label: "Kracht toegewezen aan een dienst" },
  { key: "freelancer.checked_in", label: "Kracht ingecheckt op locatie" },
  { key: "timesheet.approved", label: "Uren goedgekeurd" },
  { key: "dispute.opened", label: "Dispuut geopend" },
  { key: "invoice.issued", label: "Factuur aangemaakt" },
] as const;
export type WebhookEventKey = (typeof WEBHOOK_EVENTS)[number]["key"];

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*|\[?fe80:.*)$/i;

/** https only, no internal/loopback/link-local hosts (incl. cloud metadata 169.254.x). */
export function assertSafeWebhookUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw AppError.validation("Ongeldige URL");
  }
  if (u.protocol !== "https:") throw AppError.validation("Webhook-URL moet met https:// beginnen");
  if (PRIVATE_HOST.test(u.hostname)) throw AppError.validation("Deze URL wijst naar een intern adres en is niet toegestaan");
  if (u.username || u.password) throw AppError.validation("Zet geen inloggegevens in de URL");
  return u.toString();
}

const newSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

export async function listWebhooks(tenantId: string) {
  return prisma.webhookSubscription.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, eventTypes: true, active: true, createdAt: true, updatedAt: true },
  });
}

export async function createWebhook(tenantId: string, url: string, eventTypes: WebhookEventKey[]): Promise<{ id: string; secret: string }> {
  if ((await prisma.webhookSubscription.count({ where: { tenantId } })) >= 20) throw AppError.precondition("Maximaal 20 webhooks per organisatie");
  const secret = newSecret();
  const sub = await prisma.webhookSubscription.create({ data: { tenantId, url: assertSafeWebhookUrl(url), eventTypes, secretCiphertext: encryptWebhookSecret(secret) }, select: { id: true } });
  return { id: sub.id, secret };
}

async function own(tenantId: string, id: string) {
  const sub = await prisma.webhookSubscription.findFirst({ where: { id, tenantId } });
  if (!sub) throw AppError.notFound("Webhook niet gevonden");
  return sub;
}

export async function updateWebhook(tenantId: string, id: string, patch: { active?: boolean | undefined; eventTypes?: WebhookEventKey[] | undefined; url?: string | undefined }) {
  await own(tenantId, id);
  return prisma.webhookSubscription.update({
    where: { id },
    data: {
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.eventTypes ? { eventTypes: patch.eventTypes } : {}),
      ...(patch.url ? { url: assertSafeWebhookUrl(patch.url) } : {}),
    },
    select: { id: true, url: true, eventTypes: true, active: true },
  });
}

/** New signing secret; the old one stops working immediately. Returned once. */
export async function rotateWebhookSecret(tenantId: string, id: string): Promise<string> {
  await own(tenantId, id);
  const secret = newSecret();
  await prisma.webhookSubscription.update({ where: { id }, data: { secretCiphertext: encryptWebhookSecret(secret) } });
  return secret;
}

export async function deleteWebhook(tenantId: string, id: string): Promise<void> {
  await own(tenantId, id);
  await prisma.webhookSubscription.delete({ where: { id } });
}

/** Sends a signed "ping" so the receiver can verify its signature check. */
export async function testWebhook(tenantId: string, id: string): Promise<{ ok: boolean; status: number | null; error?: string }> {
  const sub = await own(tenantId, id);
  const body = JSON.stringify({ id: randomBytes(12).toString("hex"), type: "ping", createdAt: new Date().toISOString(), data: { message: "Test van ZekerFlex" } });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac("sha256", decryptWebhookSecret(sub.secretCiphertext)).update(`${timestamp}.${body}`).digest("hex");
  try {
    const res = await fetch(sub.url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "ZekerFlex-Webhooks/1.0", "x-zekerflex-event": "ping", "x-zekerflex-timestamp": timestamp, "x-zekerflex-signature": `v1=${sig}` },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: null, error: (err as Error).message };
  }
}

export async function recentDeliveries(tenantId: string, take = 30) {
  return prisma.webhookDelivery.findMany({
    where: { subscription: { tenantId } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, eventType: true, statusCode: true, attempts: true, deliveredAt: true, lastError: true, createdAt: true, subscription: { select: { url: true } } },
  });
}
