import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ naar: z.enum(["concept", "live"]) });

// POST /api/admin/bedrijven/<id>/klussen/<shiftId> — een klus van een bedrijf met één klik naar concept (weg uit de lijst van
// werkers) en weer live. Een bedrijf dat nog niet is gecontroleerd zet zijn klus meteen live (lib/company/gecontroleerd.ts);
// dit is de handrem voor Beheer als er iets niet klopt. Alleen een klus waar nog niemand op is ingepland, en nooit een klus die
// al begonnen is. De reacties en het bedrijf blijven zoals ze waren; er gaat geen bericht uit.
export const POST = withAdminAccess<{ id: string; shiftId: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { naar } = schema.parse(await request.json().catch(() => ({})));
  const shift = await prisma.shift.findFirst({
    where: { id: params.shiftId, branch: { tenantId: params.id } },
    select: { id: true, title: true, status: true, startsAt: true, _count: { select: { assignments: { where: { cancelledAt: null } } } } },
  });
  if (!shift) throw AppError.notFound("Klus niet gevonden bij dit bedrijf");

  if (naar === "concept") {
    if (shift.status !== "OPEN" && shift.status !== "MATCHING") {
      throw AppError.conflict("Alleen een klus die open staat kan naar concept.");
    }
    if (shift._count.assignments > 0) throw AppError.conflict("Er staan al mensen ingepland op deze klus, dus hij kan niet naar concept.");
  } else {
    if (shift.status !== "DRAFT") throw AppError.conflict("Deze klus staat niet in concept.");
    if (shift.startsAt.getTime() < Date.now()) throw AppError.conflict("De starttijd van deze klus is voorbij: hij kan niet meer live.");
  }

  const status = naar === "concept" ? "DRAFT" : "OPEN";
  await prisma.shift.update({ where: { id: shift.id }, data: { status } });
  await recordAudit({
    category: "MATCHING",
    action: naar === "concept" ? "admin.shift.to_draft" : "admin.shift.to_live",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} zette de klus "${shift.title}" ${naar === "concept" ? "terug naar concept" : "weer live"}`,
    targetType: "shift",
    targetId: shift.id,
    metadata: { tenantId: params.id },
  });
  return NextResponse.json({ ok: true, status });
});
