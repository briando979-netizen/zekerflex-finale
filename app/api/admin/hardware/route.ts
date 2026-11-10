import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { getInstellingen, setInstellingen } from "@/lib/hardware/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/hardware: de keuzes van de eigenaar (marge, eigen prijzen, wat uit de verkoop is). */
export async function GET(): Promise<NextResponse> {
  try {
    requireRole(await requirePrincipal(), "PLATFORM_ADMIN");
    return NextResponse.json({ instellingen: await getInstellingen() });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/** PUT /api/admin/hardware: bewaart marge, eigen verkoopprijzen, wat uit de verkoop is en de installatieprijs. */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const json: unknown = await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    });
    const bewaard = await setInstellingen(json);
    await recordAudit({
      category: "ADMIN",
      action: "hardware.instellingen",
      actorUserId: principal.userId,
      actorLabel: "admin",
      summary: `Hardwareprijzen bijgewerkt (marge ${bewaard.margePct}%, ${Object.keys(bewaard.verkoopCent).length} eigen prijzen, ${bewaard.uit.length} uit de verkoop)`,
      targetType: "hardware",
      targetId: "instellingen",
    });
    return NextResponse.json({ instellingen: bewaard });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
