import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { alleAanmeldingen, beoordeel } from "@/lib/kaart/aanmelden-store";
import { wisPlaatsenGeheugen } from "@/lib/kaart/plaatsen-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/kaart: alle aanmeldingen voor de kaart, wachtend eerst. */
export async function GET(): Promise<NextResponse> {
  try {
    requireRole(await requirePrincipal(), "PLATFORM_ADMIN");
    return NextResponse.json({ aanmeldingen: await alleAanmeldingen() });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({ tenantId: z.string().min(6).max(60), status: z.enum(["goedgekeurd", "afgewezen"]), reden: z.string().max(200).optional() });

/** PATCH /api/admin/kaart { tenantId, status, reden? }: goedkeuren (komt op de kaart) of afwijzen (met een reden). */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const p = schema.safeParse(await request.json().catch(() => null));
    if (!p.success) throw AppError.validation("Dit verzoek klopt niet.");
    const a = await beoordeel(p.data.tenantId, p.data.status, p.data.reden ?? "");
    wisPlaatsenGeheugen();
    await recordAudit({
      category: "ADMIN",
      action: p.data.status === "goedgekeurd" ? "kaart.goedgekeurd" : "kaart.afgewezen",
      actorUserId: principal.userId,
      actorLabel: "admin",
      summary: `Aanmelding voor ZekerFlex Kaart ${p.data.status === "goedgekeurd" ? "goedgekeurd" : "afgewezen"}: ${a.naam}`,
      targetType: "tenant",
      targetId: a.tenantId,
    });
    return NextResponse.json({ aanmelding: a });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
