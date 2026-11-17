import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { importeerCjProduct, type ImportUitkomst } from "@/lib/shop/cj/importeer";
import { SHOP_CATEGORIEEN } from "@/lib/shop/categorieen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// per product: één CJ-aanvraag (1/s), tot zes foto's en een vertaling door het eigen model
export const maxDuration = 300;

const schema = z.object({
  pids: z.array(z.string().trim().min(1).max(64)).min(1).max(10),
  actief: z.boolean().default(false),
  categorie: z.enum(SHOP_CATEGORIEEN).optional(),
});

// POST /api/admin/shop-ai/cj/importeer — producten van CJ in de webshop zetten, één voor één.
// Een product dat misgaat houdt de rest niet tegen: per pid een uitkomst of een fout.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  await enforceRateLimit({ name: "shop-cj-import", identifier: principal.userId, limit: 60, windowSeconds: 3600, message: "Even rustig aan met overnemen; probeer het zo opnieuw." });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Kies één tot tien producten om over te nemen.");
  const uitkomsten: ({ pid: string } & (ImportUitkomst | { fout: string }))[] = [];
  for (const pid of parsed.data.pids) {
    try {
      const u = await importeerCjProduct(pid, { actorUserId: principal.userId, actief: parsed.data.actief, categorie: parsed.data.categorie });
      uitkomsten.push({ pid, ...u });
    } catch (e) {
      uitkomsten.push({ pid, fout: e instanceof AppError ? e.message : "Overnemen lukte niet." });
    }
  }
  return NextResponse.json({ uitkomsten });
});
