import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { alleBestellingen, registreerBijTransip, zetStatus } from "@/lib/domeinen/bestelling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → Domeinen: alle domeinbestellingen, afvinken (geregistreerd, mislukt,
// geannuleerd) of registreren via TransIP (maakt een factuur: alleen op een
// klik). Alleen platformbeheerders.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ bestellingen: await alleBestellingen() }));

const schema = z.union([
  z.object({
    id: z.string().min(1).max(60),
    status: z.enum(["GEREGISTREERD", "MISLUKT", "GEANNULEERD"]),
    notitie: z.string().trim().max(500).default(""),
  }),
  z.object({ id: z.string().min(1).max(60), actie: z.literal("registreer") }),
]);

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Kies een geldige status.");
  const door = `user:${principal.userId}`;
  if ("actie" in parsed.data) await registreerBijTransip(parsed.data.id, door);
  else await zetStatus(parsed.data.id, parsed.data.status, parsed.data.notitie, door);
  return NextResponse.json({ bestellingen: await alleBestellingen() });
});
