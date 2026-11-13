import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { leesAchtergronden, zetAchtergrond } from "@/lib/ontwerp/achtergrond";
import { ACHTERGROND_PAGINAS, leesKeuze, type AchtergrondPagina } from "@/lib/ontwerp/achtergrond-core";
import { mediaItem } from "@/lib/ontwerp/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: wat nu is gekozen voor /shop en de homepage.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ achtergrond: await leesAchtergronden() });
});

// PUT { pagina: "shop" | "home", keuze: null | { media, poster? } }: kiezen of weghalen (null = geen).
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const body = (await request.json().catch(() => null)) as { pagina?: unknown; keuze?: unknown } | null;
  const pagina = ACHTERGROND_PAGINAS.find((p) => p === body?.pagina) as AchtergrondPagina | undefined;
  if (!pagina) throw AppError.validation("Kies een pagina: shop of home.");
  const keuze = leesKeuze(body?.keuze);
  if (keuze === undefined) throw AppError.validation("Deze keuze kon niet worden gelezen.");
  if (keuze) {
    const item = await mediaItem(keuze.media);
    if (!item) throw AppError.validation("Dit bestand bestaat niet (meer) in de bibliotheek.");
    if (keuze.poster) {
      const poster = await mediaItem(keuze.poster);
      if (poster?.soort !== "foto") throw AppError.validation("Het stilstaande beeld moet een foto zijn.");
    }
  }
  const achtergrond = await zetAchtergrond(pagina, keuze);
  await recordAudit({ category: "ADMIN", action: "ontwerp.achtergrond", actorUserId: principal.userId, actorLabel: "user", summary: `Achtergrond van ${pagina}: ${keuze ? "gekozen" : "geen"}`, targetType: "ontwerp-achtergrond", targetId: pagina });
  return NextResponse.json({ ok: true, achtergrond });
});
