import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { leesVerhuisStand, telCjFotos, verhuisCjFotos, zetVerhuisStand } from "@/lib/shop/cj/fotos-verhuizen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// per foto: lezen uit de database, verkleinen (sharp) en schrijven; de ronde stopt zelf binnen het tijdsbudget
export const maxDuration = 300;

// GET  /api/admin/shop-ai/cj/fotos-verhuizen — droge telling: hoeveel CJ-foto's staan nog in de database, hoeveel MB,
//      en wat een steekproef na verkleining weegt. Verandert niets.
// POST /api/admin/shop-ai/cj/fotos-verhuizen — één ronde echt verhuizen (lib/shop/cj/fotos-verhuizen.ts); het scherm roept
//      hem aan tot `rest` 0 is. Alleen op een klik van een beheerder, nooit vanzelf.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [telling, achtergrond] = await Promise.all([telCjFotos(), leesVerhuisStand()]);
  return NextResponse.json({ ...telling, achtergrond });
});

const schema = z.object({ budgetMs: z.number().int().min(10_000).max(240_000).default(200_000), achtergrond: z.boolean().default(false) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  await enforceRateLimit({ name: "shop-cj-fotos-verhuizen", identifier: principal.userId, limit: 60, windowSeconds: 3600, message: "Even rustig aan; probeer het zo opnieuw." });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Ongeldig tijdsbudget.");
  if (parsed.data.achtergrond) {
    // de knop zet alleen de vlag; de cron (elke 5 minuten) doet de rondes, ook als dit scherm dicht is
    const stand = await zetVerhuisStand(true);
    await recordAudit({ category: "ADMIN", action: "shop.cj.fotos-verhuizing-gestart", actorUserId: principal.userId, actorLabel: "user", summary: "CJ-foto's naar schijf: verhuizing op de achtergrond gestart", targetType: "shop", targetId: "cj-fotos" });
    return NextResponse.json({ status: "gestart", stand });
  }
  return NextResponse.json(await verhuisCjFotos({ actorUserId: principal.userId, budgetMs: parsed.data.budgetMs }));
});
