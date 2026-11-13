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
  actiefPlatform,
  controleerStripeSleutel,
  gebruikStripeAccount,
  isOudConnectAccount,
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

/** De Connect-accounts van werkers die nu bestaan (alleen de id's). */
async function bestaandeConnectIds(): Promise<string[]> {
  return (await prisma.freelancerProfile.findMany({ where: { stripeConnectedAccountId: { not: null } }, select: { stripeConnectedAccountId: true } }))
    .map((p) => p.stripeConnectedAccountId)
    .filter((id): id is string => typeof id === "string");
}

/**
 * Na een wissel: een Connect-account van een ander platform-account kan geen overboeking meer krijgen. Zet daar
 * "uitbetalen aan" uit, zodat de uitbetaling naar de eigen IBAN gaat (lib/payouts/execute.ts, lib/timesheets/approve.ts
 * en lib/claims/fulfillment.ts kijken alleen naar die vlag). Gaat het platform terug, dan zet de statuscheck van de
 * werker (GET /api/me/payout/stripe-connect) hem live bij Stripe weer goed. Het id zelf blijft staan.
 */
async function zetOudeUitbetalingUit(): Promise<number> {
  const aan = await prisma.freelancerProfile.findMany({
    where: { stripeConnectedAccountId: { not: null }, stripePayoutsEnabled: true },
    select: { id: true, stripeConnectedAccountId: true },
  });
  const oud: string[] = [];
  for (const p of aan) if (await isOudConnectAccount(p.stripeConnectedAccountId)) oud.push(p.id);
  if (oud.length === 0) return 0;
  return (await prisma.freelancerProfile.updateMany({ where: { id: { in: oud } }, data: { stripePayoutsEnabled: false } })).count;
}

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
  // de Connect-accounts die nu bestaan, horen bij het platform-account dat we verlaten (alleen de id's onthouden)
  const oudeConnect = await bestaandeConnectIds();
  const vorige = await stripeAccountInfo();
  const verlaten = await actiefPlatform();
  const actief = await gebruikStripeAccount(sleutel, principal.fullName, `${env.APP_BASE_URL.replace(/\/$/, "")}/api/webhooks/stripe`);
  if (verlaten !== actief.accountId) await markeerOudeConnectAccounts(oudeConnect, verlaten);
  const uitbetalingUit = await zetOudeUitbetalingUit();
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
    metadata: { accountId: actief.accountId, vorigeAccountId: vorige?.accountId ?? "env", connectOpnieuw: oudeConnect.length, uitbetalingUit },
  });
  return NextResponse.json({ ok: true, actief });
});

export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (_req, { principal }) => {
  // wat er nu gekoppeld is, hoort bij het account dat we verlaten; de id's van het account waar we heen gaan, gelden weer
  await markeerOudeConnectAccounts(await bestaandeConnectIds(), await actiefPlatform());
  const actief = await terugNaarVorigStripeAccount();
  await zetOudeUitbetalingUit();
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
