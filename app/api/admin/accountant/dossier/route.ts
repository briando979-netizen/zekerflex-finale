import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { jaarOverzicht } from "@/lib/accountant/jaar";
import { termijnenNu } from "@/lib/accountant/maandcontrole";
import { getStructuur } from "@/lib/accountant/store";
import { dossierHtml } from "@/lib/accountant/dossier";
import { jaarUit } from "@/lib/accountant/jaar-kern";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accountant/dossier?jaar=2026: één HTML-bestand voor een menselijk accountant
// (printen of als PDF bewaren). Alleen lezen; elke download komt in het auditlog.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const nu = new Date();
  const jaar = jaarUit(request.url, Number(amsterdamDayKey(nu).slice(0, 4)));
  const [overzicht, structuur, termijnen] = await Promise.all([jaarOverzicht(jaar), getStructuur(), termijnenNu(nu)]);
  const eerste = overzicht[0] ?? null;
  const html = dossierHtml({
    administratie: eerste?.naam ?? "nog geen echte administratie",
    gemaaktOp: amsterdamDayKey(nu),
    concept: eerste?.concept ?? null,
    vragen: eerste?.vragen ?? ["Er is nog geen echte administratie: eerst de boekhouding inrichten."],
    structuur,
    termijnen,
  });
  await recordAudit({
    category: "ADMIN",
    action: "accountant.dossier",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Dossier voor de accountant gedownload (boekjaar ${jaar})`,
    targetType: "accountant",
    targetId: String(jaar),
  });
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="zekerflex-dossier-${jaar}.html"`,
      "Cache-Control": "no-store",
    },
  });
});
