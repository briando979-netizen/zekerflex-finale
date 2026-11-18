import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { telCjFotos, verhuisCjFotos } from "@/lib/shop/cj/fotos-verhuizen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// per foto: lezen uit de database, verkleinen (sharp) en schrijven; de ronde stopt zelf binnen het tijdsbudget
export const maxDuration = 300;

// GET  /api/admin/shop-ai/cj/fotos-verhuizen — droge telling: hoeveel CJ-foto's staan nog in de database, hoeveel MB,
//      en wat een steekproef na verkleining weegt. Verandert niets.
// POST /api/admin/shop-ai/cj/fotos-verhuizen — één ronde echt verhuizen (lib/shop/cj/fotos-verhuizen.ts); het scherm roept
//      hem aan tot `rest` 0 is. Alleen op een klik van een beheerder, nooit vanzelf.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json(await telCjFotos());
});

const schema = z.object({ budgetMs: z.number().int().min(10_000).max(240_000).default(200_000) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  await enforceRateLimit({ name: "shop-cj-fotos-verhuizen", identifier: principal.userId, limit: 60, windowSeconds: 3600, message: "Even rustig aan; probeer het zo opnieuw." });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Ongeldig tijdsbudget.");
  return NextResponse.json(await verhuisCjFotos({ actorUserId: principal.userId, budgetMs: parsed.data.budgetMs }));
});
