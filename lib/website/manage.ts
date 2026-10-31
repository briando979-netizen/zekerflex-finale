import type Stripe from "stripe";
import type { ManagedWebsite, ManagedWebsiteStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { sealSecret, openSecret } from "@/lib/security/sealed-secret";
import { ensureStripeCustomer, createWebsiteManagementCheckoutSession } from "@/lib/billing/stripe";

// ---------------------------------------------------------------------------
// "Website-beheer" — ZekerFlex beheert de website van een opdrachtgever. Zit
// achter een abonnement (Stripe): de functie is zichtbaar maar vergrendeld tot
// er betaald is; daarna vult de opdrachtgever zijn websitegegevens + SSH-toegang
// in. Die gevoelige gegevens worden AES-256-GCM-verzegeld (lib/security/
// sealed-secret) opgeslagen — nooit plaintext — en alleen admins kunnen ze,
// geaudit, weer inzien om het beheer uit te voeren.
// ---------------------------------------------------------------------------

const SECRET_PURPOSE = "managed-website";

export const WEBSITE_PLANS = {
  basis: {
    label: "Basis",
    priceCentsPerMonth: 4900,
    blurb: "Onderhoud, updates, back-ups, uptime-bewaking en beveiliging van je bestaande website.",
    features: ["Software- en plugin-updates", "Dagelijkse back-ups", "Uptime-bewaking", "Beveiliging & SSL", "Kleine tekst-/beeldwijzigingen"],
  },
  pro: {
    label: "Pro",
    priceCentsPerMonth: 9900,
    blurb: "Alles van Basis, plus doorontwikkeling, SEO en maandelijkse wijzigingen door ons team.",
    features: ["Alles uit Basis", "Maandelijkse doorontwikkeling", "SEO-optimalisatie", "Snelheidsoptimalisatie", "Voorrang-support"],
  },
} as const;

export type WebsitePlanKey = keyof typeof WEBSITE_PLANS;

export function isWebsitePlan(v: string): v is WebsitePlanKey {
  return v === "basis" || v === "pro";
}

/** Een abonnement is "ontgrendeld" zodra het betaald is (alles ná PENDING_PAYMENT, behalve geannuleerd). */
export function isUnlocked(record: Pick<ManagedWebsite, "status"> | null): boolean {
  if (!record) return false;
  return record.status === "ONBOARDING" || record.status === "SUBMITTED" || record.status === "ACTIVE" || record.status === "PAUSED";
}

export async function getManagedWebsite(tenantId: string): Promise<ManagedWebsite | null> {
  return prisma.managedWebsite.findUnique({ where: { tenantId } });
}

/** Start (of herstart) het abonnement: zorgt voor een Stripe-klant, maakt een
 *  subscription-Checkout en zet het record op PENDING_PAYMENT. */
export async function startWebsiteSubscription(input: {
  tenantId: string;
  userId: string;
  email: string | null;
  plan: WebsitePlanKey;
}): Promise<{ checkoutUrl: string }> {
  const planDef = WEBSITE_PLANS[input.plan];
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { id: true, name: true, stripeCustomerId: true },
  });
  if (!tenant) throw AppError.notFound("Organisatie niet gevonden");

  const customerId = await ensureStripeCustomer({
    existingCustomerId: tenant.stripeCustomerId,
    email: input.email,
    name: tenant.name,
    tenantId: tenant.id,
  });
  if (customerId !== tenant.stripeCustomerId) {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { stripeCustomerId: customerId } });
  }

  const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");
  const session = await createWebsiteManagementCheckoutSession({
    stripeCustomerId: customerId,
    tenantId: tenant.id,
    plan: input.plan,
    planLabel: planDef.label,
    priceCentsPerMonth: planDef.priceCentsPerMonth,
    successUrl: `${baseUrl}/werkgever/website?abonnement=actief`,
    cancelUrl: `${baseUrl}/werkgever/website?abonnement=geannuleerd`,
  });
  if (!session.url) throw AppError.upstream("Kon geen betaalscherm starten — probeer het zo opnieuw.");

  await prisma.managedWebsite.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, requestedById: input.userId, status: "PENDING_PAYMENT", plan: input.plan, stripeSessionId: session.id },
    update: { status: "PENDING_PAYMENT", plan: input.plan, stripeSessionId: session.id, requestedById: input.userId },
  });

  return { checkoutUrl: session.url };
}

/** Webhook: betaald → ontgrendel (ONBOARDING) en bewaar het subscription-id. */
export async function activateManagedWebsite(session: Stripe.Checkout.Session): Promise<void> {
  const tenantId = session.metadata?.managedWebsiteTenantId;
  if (!tenantId) return;
  const existing = await prisma.managedWebsite.findUnique({ where: { tenantId } });
  if (!existing) return;

  const subId = typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
  const data: Prisma.ManagedWebsiteUpdateInput = { stripeSubId: subId, subscribedAt: new Date() };
  // Alleen vooruit: een al ingevulde/actieve site niet terugzetten naar onboarding.
  if (existing.status === "PENDING_PAYMENT") data.status = "ONBOARDING";
  await prisma.managedWebsite.update({ where: { tenantId }, data });

  await recordAudit({
    category: "BILLING",
    action: "website.subscription.active",
    actorLabel: "integration:stripe",
    summary: `Website-beheer abonnement actief (${existing.plan ?? "?"}) voor tenant ${tenantId}`,
    targetType: "managed-website",
    targetId: existing.id,
    metadata: { sessionId: session.id },
  });
}

/** Webhook: opgezegd subscription → zet het record op CANCELLED. */
export async function cancelManagedWebsiteBySub(subId: string): Promise<void> {
  const record = await prisma.managedWebsite.findFirst({ where: { stripeSubId: subId } });
  if (!record || record.status === "CANCELLED") return;
  await prisma.managedWebsite.update({ where: { id: record.id }, data: { status: "CANCELLED" } });
  await recordAudit({
    category: "BILLING",
    action: "website.subscription.cancelled",
    actorLabel: "integration:stripe",
    summary: `Website-beheer abonnement opgezegd voor tenant ${record.tenantId}`,
    targetType: "managed-website",
    targetId: record.id,
  });
}

export interface WebsiteDetailsInput {
  domain?: string | undefined;
  provider?: string | undefined;
  notes?: string | undefined;
  sshHost?: string | undefined;
  sshPort?: string | undefined;
  sshUser?: string | undefined;
  sshPrivateKey?: string | undefined;
  hostingLoginUrl?: string | undefined;
  hostingUsername?: string | undefined;
  hostingPassword?: string | undefined;
  extra?: string | undefined;
}

/** Opdrachtgever vult (of werkt bij) zijn websitegegevens + SSH-toegang in. De
 *  gevoelige velden worden verzegeld; alleen niet-lege waarden worden bewaard.
 *  `adminOverride` geeft de platform-admin gratis toegang: zonder abonnement
 *  wordt direct een actief record aangemaakt. */
export async function saveWebsiteDetails(tenantId: string, input: WebsiteDetailsInput, opts: { adminOverride?: boolean } = {}): Promise<void> {
  let record = await prisma.managedWebsite.findUnique({ where: { tenantId } });
  if (!record) {
    if (!opts.adminOverride) throw AppError.notFound("Nog geen website-beheer abonnement");
    record = await prisma.managedWebsite.create({ data: { tenantId, status: "ACTIVE", plan: "admin", subscribedAt: new Date() } });
  }
  if (!isUnlocked(record) && !opts.adminOverride) throw AppError.precondition("Je abonnement is nog niet actief.");

  const secrets: Record<string, string> = {};
  const put = (key: string, value: string | undefined) => {
    if (value && value.trim()) secrets[key] = value.trim();
  };
  put("sshHost", input.sshHost);
  put("sshPort", input.sshPort);
  put("sshUser", input.sshUser);
  put("sshPrivateKey", input.sshPrivateKey);
  put("hostingLoginUrl", input.hostingLoginUrl);
  put("hostingUsername", input.hostingUsername);
  put("hostingPassword", input.hostingPassword);
  put("extra", input.extra);
  const hasSecret = Object.keys(secrets).length > 0;

  const data: Prisma.ManagedWebsiteUpdateInput = {
    domain: input.domain?.trim() || null,
    provider: input.provider?.trim() || null,
    notes: input.notes?.trim() || null,
    status: record.status === "ONBOARDING" ? "SUBMITTED" : record.status,
    submittedAt: new Date(),
  };
  if (hasSecret) {
    data.secretsSealed = sealSecret(JSON.stringify(secrets), SECRET_PURPOSE);
    data.secretsSetAt = new Date();
  }
  await prisma.managedWebsite.update({ where: { tenantId }, data });

  await recordAudit({
    category: "ADMIN",
    action: "website.details.submitted",
    actorLabel: "user",
    summary: `Websitegegevens ingevuld voor ${input.domain?.trim() || tenantId}${hasSecret ? " (incl. toegang)" : ""}`,
    targetType: "managed-website",
    targetId: record.id,
  });
}

// ---- Admin ---------------------------------------------------------------

export interface AdminWebsiteRow {
  id: string;
  tenantId: string;
  tenantName: string;
  status: ManagedWebsiteStatus;
  plan: string | null;
  domain: string | null;
  provider: string | null;
  notes: string | null;
  hasSecrets: boolean;
  subscribedAt: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
}

export async function listManagedWebsites(): Promise<AdminWebsiteRow[]> {
  const rows = await prisma.managedWebsite.findMany({
    orderBy: { updatedAt: "desc" },
    include: { tenant: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    tenantName: r.tenant.name,
    status: r.status,
    plan: r.plan,
    domain: r.domain,
    provider: r.provider,
    notes: r.notes,
    hasSecrets: Boolean(r.secretsSealed),
    subscribedAt: r.subscribedAt,
    submittedAt: r.submittedAt,
    createdAt: r.createdAt,
  }));
}

/** Ontsleutelt de opgeslagen toegangsgegevens — admin-only en geaudit. */
export async function revealWebsiteSecrets(id: string, actorUserId: string): Promise<Record<string, string> | null> {
  const record = await prisma.managedWebsite.findUnique({ where: { id } });
  if (!record?.secretsSealed) return null;
  const parsed = JSON.parse(openSecret(record.secretsSealed, SECRET_PURPOSE)) as Record<string, string>;
  await recordAudit({
    category: "ADMIN",
    action: "website.secrets.revealed",
    actorUserId,
    actorLabel: "user",
    severity: "warning",
    summary: `Website-toegangsgegevens ingezien voor ${record.domain ?? record.tenantId}`,
    targetType: "managed-website",
    targetId: id,
  });
  return parsed;
}

export async function setManagedWebsiteStatus(id: string, status: ManagedWebsiteStatus, actorUserId: string): Promise<void> {
  await prisma.managedWebsite.update({ where: { id }, data: { status } });
  await recordAudit({
    category: "ADMIN",
    action: "website.status.changed",
    actorUserId,
    actorLabel: "user",
    summary: `Website-beheer status → ${status}`,
    targetType: "managed-website",
    targetId: id,
  });
}
