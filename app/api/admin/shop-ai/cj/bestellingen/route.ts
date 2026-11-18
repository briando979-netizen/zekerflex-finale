import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { leesCjInstellingen } from "@/lib/shop/cj/importeer";
import { betaalCjBestelling, cjKandidaten, cjSaldoUsdCents, plaatsCjBestelling, volgCjBestellingen } from "@/lib/shop/cj/bestelling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/admin/shop-ai/cj/bestellingen — het CJ-saldo, de instellingen van de bestelstroom en de recente betaalde
// webshopbestellingen met CJ-producten (met wat er bij CJ mee gebeurd is).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [saldoUsdCents, instellingen, bestellingen] = await Promise.all([cjSaldoUsdCents(), leesCjInstellingen(), cjKandidaten()]);
  return NextResponse.json({ saldoUsdCents, instellingen, bestellingen });
});

const schema = z.object({
  actie: z.enum(["plaatsen", "betalen", "volgen"]),
  orderId: z.string().trim().min(1).max(64).optional(),
});

// POST — één bewuste klik per stap: plaatsen (aanmaken bij CJ), betalen (uit het saldo, onder de grens), volgen (nu navragen).
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  await enforceRateLimit({ name: "shop-cj-bestellen", identifier: principal.userId, limit: 60, windowSeconds: 3600, message: "Even rustig aan; probeer het zo opnieuw." });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Kies plaatsen, betalen of volgen.");
  const actor = { actorUserId: principal.userId, actorLabel: "user" };
  if (parsed.data.actie === "volgen") return NextResponse.json({ volgen: await volgCjBestellingen() });
  if (!parsed.data.orderId) throw AppError.validation("Welke bestelling?");
  const stand = parsed.data.actie === "plaatsen" ? await plaatsCjBestelling(parsed.data.orderId, { ...actor, betalen: false }) : await betaalCjBestelling(parsed.data.orderId, actor);
  return NextResponse.json({ stand });
});
