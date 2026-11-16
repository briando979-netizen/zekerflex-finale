import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { DEFAULT_PRICING } from "@/lib/telephony/plans";
import { adminUpdateLine, adminUpdateSchema, getPricing, listLines, pricingSchema, savePricing } from "@/lib/telephony/lines";
import { koppelNummer } from "@/lib/telephony/lijn-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/telefonie — alle aanvragen + de prijzen die nu gelden.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [lines, pricing] = await Promise.all([listLines(), getPricing()]);
  return NextResponse.json({ lines, pricing, defaults: DEFAULT_PRICING });
});

// POST — { action: "update", id, status, number?, adminNote? } of { action: "pricing", pricing }.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = await request.json().catch(() => ({}));
  const actor = { userId: principal.userId, name: principal.fullName };
  if (body?.action === "pricing") {
    const pricing = await savePricing(pricingSchema.parse(body.pricing), principal.userId);
    return NextResponse.json({ pricing });
  }
  const line = await adminUpdateLine(adminUpdateSchema.parse(body), actor);
  // actief gezet: het nummer in ons Twilio-account meteen op onze webhooks zetten (bellen en sms gaan dan naar de
  // instellingen van deze klant, lib/telephony/lijn.ts); lukt dat niet, dan zegt `koppeling` wat de beheerder moet doen
  const koppeling = line.status === "actief" && line.number ? await koppelNummer(line.number).catch(() => "Koppelen bij Twilio lukte niet.") : null;
  return NextResponse.json({ line, koppeling });
});
