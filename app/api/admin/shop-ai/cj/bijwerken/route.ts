import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { bijwerkenVanCj } from "@/lib/shop/cj/importeer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// per product één of twee CJ-aanvragen (1/s) en soms een vertaling; de functie stopt zelf binnen het tijdsbudget
export const maxDuration = 300;

const schema = z.object({ vanaf: z.number().int().min(0).max(100_000).default(0) });

// POST /api/admin/shop-ai/cj/bijwerken — alle CJ-producten in de winkel langs: categorie (met de nieuwste regels),
// voorraad per variant en een tekst die nog Engels of half Duits is. Werkt in rondes: `volgende` is de plek om verder
// te gaan, null = klaar. Het scherm roept de route aan tot volgende null is.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  await enforceRateLimit({ name: "shop-cj-bijwerken", identifier: principal.userId, limit: 40, windowSeconds: 3600, message: "Even rustig aan met bijwerken; probeer het zo opnieuw." });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Ongeldige startpositie.");
  const uitkomst = await bijwerkenVanCj({ actorUserId: principal.userId, vanaf: parsed.data.vanaf, budgetMs: 200_000 });
  return NextResponse.json(uitkomst);
});
