import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipal, requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { adminFullAccess } from "@/lib/auth/admin-access";
import {
  getManagedWebsite,
  isUnlocked,
  isWebsitePlan,
  startWebsiteSubscription,
  saveWebsiteDetails,
  WEBSITE_PLANS,
} from "@/lib/website/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tenantFor(): Promise<{ tenantId: string; userId: string; email: string; admin: boolean }> {
  const principal = await getPrincipal();
  if (!principal) throw AppError.unauthenticated();
  requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) throw AppError.validation("Geen organisatie gekoppeld aan je account.");
  return { tenantId, userId: principal.userId, email: principal.email, admin: adminFullAccess(principal) };
}

// GET — huidige status van het website-beheer voor deze organisatie.
export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId, admin } = await tenantFor();
    const record = await getManagedWebsite(tenantId);
    return NextResponse.json({
      status: record?.status ?? null,
      unlocked: isUnlocked(record) || admin,
      adminOverride: admin,
      plan: record?.plan ?? null,
      domain: record?.domain ?? null,
      provider: record?.provider ?? null,
      notes: record?.notes ?? null,
      hasSecrets: Boolean(record?.secretsSealed),
      plans: WEBSITE_PLANS,
    });
  } catch (err) {
    return jsonError(err);
  }
}

const detailsSchema = z.object({
  action: z.literal("save"),
  domain: z.string().trim().max(200).optional(),
  provider: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  sshHost: z.string().trim().max(200).optional(),
  sshPort: z.string().trim().max(8).optional(),
  sshUser: z.string().trim().max(120).optional(),
  sshPrivateKey: z.string().max(20000).optional(),
  hostingLoginUrl: z.string().trim().max(300).optional(),
  hostingUsername: z.string().trim().max(200).optional(),
  hostingPassword: z.string().max(400).optional(),
  extra: z.string().trim().max(2000).optional(),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), plan: z.string() }),
  detailsSchema,
]);

// POST — abonnement starten (subscribe) of websitegegevens opslaan (save).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId, email, admin } = await tenantFor();
    const body = bodySchema.parse(await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    }));

    if (body.action === "subscribe") {
      if (!isWebsitePlan(body.plan)) throw AppError.validation("Onbekend abonnement.");
      const { checkoutUrl } = await startWebsiteSubscription({ tenantId, userId, email, plan: body.plan });
      return NextResponse.json({ ok: true, checkoutUrl });
    }

    // body bevat `action: "save"` plus de (optionele) detailvelden; saveWebsiteDetails
    // leest alleen de velden die het kent, dus het action-veld wordt genegeerd.
    // Admin krijgt gratis toegang (geen abonnement nodig).
    await saveWebsiteDetails(tenantId, body, { adminOverride: admin });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
