import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { alleBestellingen, zetStatus } from "@/lib/domeinen/bestelling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → Domeinen: alle domeinbestellingen, en afvinken (geregistreerd,
// mislukt, geannuleerd). Alleen platformbeheerders.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ bestellingen: await alleBestellingen() }));

const schema = z.object({
  id: z.string().min(1).max(60),
  status: z.enum(["GEREGISTREERD", "MISLUKT", "GEANNULEERD"]),
  notitie: z.string().trim().max(500).default(""),
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Kies een geldige status.");
  await zetStatus(parsed.data.id, parsed.data.status, parsed.data.notitie, `user:${principal.userId}`);
  return NextResponse.json({ bestellingen: await alleBestellingen() });
});
