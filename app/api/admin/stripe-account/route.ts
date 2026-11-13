import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { kvDelete } from "@/lib/storage/kv";
import {
  controleerStripeSleutel,
  gebruikStripeAccount,
  markeerOudeConnectAccounts,
  stripeAccountInfo,
  terugNaarVorigStripeAccount,
} from "@/lib/billing/stripe-account";
import { BETALEN_UIT_KEY, meetStripeAccount } from "@/lib/billing/stripe-betalen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beheer → Stripe-account (lib/billing/stripe-account.ts): alleen PLATFORM_ADMIN. "controleer" verandert niets;
// "gebruik" maakt het account het platform-account; DELETE gaat terug naar het vorige. De sleutel komt nooit terug,
// nooit in het log of de audit: alleen de laatste 4 en het account-id.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ actief: await stripeAccountInfo() }));

const schema = z.object({ actie: z.enum(["controleer", "gebruik"]), sleutel: z.string().min(10).max(300) });

/** Na een wissel: de vlag "betalen uit" weg en meteen opnieuw meten bij het nieuwe account. */
async function meetOpnieuw(): Promise<void> {
  await kvDelete(BETALEN_UIT_KEY).catch(() => undefined);
  await meetStripeAccount().catch((err: unknown) => logger.warn("stripe-account: meten na wissel mislukt", { soort: err instanceof Error ? err.name : "onbekend" }));
}

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (req, { principal }) => {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Plak de geheime sleutel uit Stripe (sk_live_… of rk_live_…).");
  const { actie, sleutel } = parsed.data;
  if (actie === "controleer") {
    const check = await controleerStripeSleutel(sleutel);
    await recordAudit({
      category: "BILLING",
      action: "stripe.account_gecontroleerd",
      severity: "info",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} controleerde een Stripe-sleutel (eindigt op ${check.eind}, account ${check.accountId})`,
      targetType: "platform",
      targetId: "stripe-account",
    });
    return NextResponse.json({ check });
  }
  // de Connect-accounts die nu bestaan, horen bij het vorige platform-account (alleen de id's onthouden)
  const oudeConnect = (await prisma.freelancerProfile.findMany({ where: { stripeConnectedAccountId: { not: null } }, select: { stripeConnectedAccountId: true } }))
    .map((p) => p.stripeConnectedAccountId)
    .filter((id): id is string => typeof id === "string");
  const vorige = await stripeAccountInfo();
  const actief = await gebruikStripeAccount(sleutel, principal.fullName, `${env.APP_BASE_URL.replace(/\/$/, "")}/api/webhooks/stripe`);
  if (vorige?.accountId !== actief.accountId) await markeerOudeConnectAccounts(oudeConnect);
  await meetOpnieuw();
  await recordAudit({
    category: "BILLING",
    action: "stripe.account_gewisseld",
    severity: "warning",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} maakte Stripe-account ${actief.accountId} het platform-account (sleutel eindigt op ${actief.eind})`,
    targetType: "platform",
    targetId: "stripe-account",
    metadata: { accountId: actief.accountId, vorigeAccountId: vorige?.accountId ?? "env", connectOpnieuw: oudeConnect.length },
  });
  return NextResponse.json({ ok: true, actief });
});

export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (_req, { principal }) => {
  const actief = await terugNaarVorigStripeAccount();
  await meetOpnieuw();
  await recordAudit({
    category: "BILLING",
    action: "stripe.account_terug",
    severity: "warning",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} ging terug naar het vorige Stripe-account (${actief ? actief.accountId : "de sleutel uit de serverinstellingen"})`,
    targetType: "platform",
    targetId: "stripe-account",
  });
  return NextResponse.json({ ok: true, actief });
});
