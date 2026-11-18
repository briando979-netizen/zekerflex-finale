import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { SHOP_CATEGORIEEN } from "@/lib/shop/categorieen";
import { rondeWachtrij, startWachtrij, wachtrijStand, wisWachtrij, zetWachtrijStatus } from "@/lib/shop/cj/wachtrij";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/admin/shop-ai/cj/wachtrij — de stand van "Alles overnemen" (voortgang, schatting, fouten).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await wachtrijStand()));

const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("start"), q: z.string().trim().max(80).default(""), land: z.string().trim().max(2).optional(), categorie: z.enum(SHOP_CATEGORIEEN).nullable().default(null), actief: z.boolean().default(false) }),
  z.object({ actie: z.enum(["pauze", "loopt", "gestopt"]) }),
  z.object({ actie: z.literal("ronde") }),
  z.object({ actie: z.literal("wis") }),
]);

// POST — start (eerste pagina ophalen, 50 punten), pauze/loopt/gestopt, "ronde" (één ronde nu, zonder op de cron te wachten), wis.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  await enforceRateLimit({ name: "shop-cj-wachtrij", identifier: principal.userId, limit: 120, windowSeconds: 3600, message: "Even rustig aan; probeer het zo opnieuw." });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Onbekende actie voor de wachtrij.");
  const d = parsed.data;
  if (d.actie === "start") return NextResponse.json(await startWachtrij({ q: d.q, land: d.land, categorie: d.categorie, actief: d.actief, actorUserId: principal.userId }));
  if (d.actie === "ronde") return NextResponse.json({ ronde: await rondeWachtrij({ budgetMs: 90_000 }), ...(await wachtrijStand()) });
  if (d.actie === "wis") {
    await wisWachtrij();
    return NextResponse.json(await wachtrijStand());
  }
  return NextResponse.json(await zetWachtrijStatus(d.actie, principal.userId));
});
