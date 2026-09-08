import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    actualStart: z.string().datetime().optional(),
    actualEnd: z.string().datetime().optional(),
    breakMinutes: z.number().int().min(0).max(240),
    note: z.string().trim().max(1000).optional(),
    // "Extra kosten factureren" — vooraf met de opdrachtgever afgestemde extra
    // kosten (materiaal, reiskosten), incl. btw, als aparte regel op de factuur.
    extraCostsCents: z.number().int().min(0).max(100_000).optional(),
    extraCostsNote: z.string().trim().min(1).max(300).optional(),
  })
  .refine((v) => !v.extraCostsCents || v.extraCostsNote, {
    message: "Beschrijf waar de extra kosten voor zijn",
    path: ["extraCostsNote"],
  });

export async function POST(request: Request, { params }: { params: { timesheetId: string } }): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    const input = schema.parse(await request.json());
    const profile = await prisma.freelancerProfile.findUnique({ where: { userId: principal.userId }, select: { id: true } });
    if (!profile) throw AppError.forbidden("Geen werknemersprofiel gevonden");
    const timesheet = await prisma.timesheet.findFirst({ where: { id: params.timesheetId, freelancerId: profile.id }, select: { id: true, status: true, scheduledStart: true, scheduledEnd: true, actualStart: true, actualEnd: true, breakMinutes: true } });
    if (!timesheet) throw AppError.notFound("Urenstaat niet gevonden");
    if (timesheet.status !== "DRAFT") throw AppError.precondition(`Deze urenstaat kan niet meer worden ingediend (${timesheet.status})`);
    const start = input.actualStart ? new Date(input.actualStart) : timesheet.actualStart ?? timesheet.scheduledStart;
    const end = input.actualEnd ? new Date(input.actualEnd) : timesheet.actualEnd ?? timesheet.scheduledEnd;
    if (end <= start) throw AppError.validation("De eindtijd moet na de starttijd liggen");
    const billableMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000) - input.breakMinutes);
    if (billableMinutes <= 0) throw AppError.validation("De urenstaat moet minstens één betaalbaar uur bevatten");
    const updated = await prisma.timesheet.update({ where: { id: timesheet.id }, data: { status: "SUBMITTED", actualStart: start, actualEnd: end, breakMinutes: input.breakMinutes, billableMinutes, submittedAt: new Date(), extraCostsCents: input.extraCostsCents ?? null, extraCostsNote: input.extraCostsCents ? (input.extraCostsNote ?? null) : null }, select: { id: true, status: true, billableMinutes: true } });
    await recordAudit({ category: "TIMESHEET", action: "timesheet.submitted", actorUserId: principal.userId, actorLabel: "user", summary: `Urenstaat ingediend: ${billableMinutes} minuten`, targetType: "timesheet", targetId: timesheet.id, metadata: { note: input.note ?? null, breakMinutes: input.breakMinutes, extraCostsCents: input.extraCostsCents ?? null } });
    return NextResponse.json({ timesheet: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
