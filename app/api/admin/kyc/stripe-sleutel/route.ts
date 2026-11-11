import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { bewaarStripeFotoSleutel, stripeFotoSleutelInfo, verwijderStripeFotoSleutel } from "@/lib/kyc/stripe-fotos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De beperkte Stripe-sleutel waarmee Admin → Gebruikers de foto's van een Stripe-controle toont
// (lib/kyc/stripe-fotos.ts). Alleen PLATFORM_ADMIN; de sleutel zelf komt nooit terug of in het log.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ sleutel: await stripeFotoSleutelInfo() }));

const schema = z.object({ sleutel: z.string().min(10).max(300) });

export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (req, { principal }) => {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Plak de beperkte sleutel uit Stripe (begint met rk_live_).");
  const info = await bewaarStripeFotoSleutel(parsed.data.sleutel, principal.fullName);
  await recordAudit({
    category: "KYC",
    action: "kyc.stripe_fotosleutel_gezet",
    severity: "warning",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} zette de Stripe-sleutel voor ID-foto's (eindigt op ${info.eind})`,
    targetType: "platform",
    targetId: "stripe-identity",
  });
  return NextResponse.json({ ok: true, sleutel: info });
});

export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (_req, { principal }) => {
  await verwijderStripeFotoSleutel();
  await recordAudit({
    category: "KYC",
    action: "kyc.stripe_fotosleutel_weg",
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} haalde de Stripe-sleutel voor ID-foto's weg`,
    targetType: "platform",
    targetId: "stripe-identity",
  });
  return NextResponse.json({ ok: true, sleutel: null });
});
