import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { kopieerUitStripe } from "@/lib/kyc/stripe-kopie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// alle Stripe-controles (±25): per controle het rapport en tot drie foto's
export const maxDuration = 300;

// POST /api/admin/kyc/stripe-kopie: de foto's en gegevens van Stripe-controles naar ZekerFlex kopiëren (lib/kyc/stripe-kopie.ts).
// Body: { userId?: string } — zonder userId alle gebruikers. Strikt platformbeheer, met een regel in de audit (kyc.stripe_gekopieerd).
const invoer = z.object({ userId: z.string().trim().min(1).max(64).optional() });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = invoer.parse(await request.json().catch(() => ({})));
  const uit = await kopieerUitStripe({ userId: input.userId ?? null }, { userId: principal.userId, email: principal.email });
  if (!uit.ok) throw AppError.validation(uit.reden);
  const fotos = uit.uitkomsten.reduce((n, u) => n + u.gekopieerd, 0);
  return NextResponse.json({
    controles: uit.uitkomsten.length,
    fotos,
    overgeslagen: uit.uitkomsten.filter((u) => u.overgeslagen).length,
    // alleen de redenen in gewone taal, zonder sessie of inhoud
    redenen: [...new Set(uit.uitkomsten.flatMap((u) => u.redenen))].slice(0, 10),
  });
});
