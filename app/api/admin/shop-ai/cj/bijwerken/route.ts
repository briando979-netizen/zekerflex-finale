import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { leesBijwerkStand, rondeBijwerken } from "@/lib/shop/cj/bijwerken-ronde";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET  /api/admin/shop-ai/cj/bijwerken — de stand van de automatische ronde (cron, elke 4 minuten): cursor, totaal, rondes,
//      laatste ronde en laatste volledige pas (lib/shop/cj/bijwerken-ronde.ts).
// POST /api/admin/shop-ai/cj/bijwerken — één extra ronde, nu, via hetzelfde slot als de cron: loopt er al een ronde, dan
//      "bezet" en niets dubbel (18 nov: de knop liep in de browser uren door, tegelijk met de cron, en CJ gaf 429).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ stand: await leesBijwerkStand() });
});

const schema = z.object({ budgetMs: z.number().int().min(10_000).max(90_000).default(60_000) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  await enforceRateLimit({ name: "shop-cj-bijwerken", identifier: principal.userId, limit: 40, windowSeconds: 3600, message: "Even rustig aan met bijwerken; probeer het zo opnieuw." });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Ongeldig tijdsbudget.");
  const uit = await rondeBijwerken({ budgetMs: parsed.data.budgetMs });
  return NextResponse.json({ ...uit, stand: await leesBijwerkStand() });
});
