import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { pushHoursSubmitted } from "@/lib/notifications/employer-push";
import { runAfter } from "@/lib/run-after";
import { urenIndienenOpen } from "@/lib/timesheets/indienen";
import { addReview, hasReviewed } from "@/lib/reviews/store";

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
    // De beoordeling van de opdrachtgever: sterren verplicht, de toelichting optioneel (wens eigenaar, 12 nov).
    review: z.object({ rating: z.number().int().min(1).max(5), text: z.string().trim().max(1500).default("") }).optional(),
  })
  .refine((v) => !v.extraCostsCents || v.extraCostsNote, {
    message: "Beschrijf waar de extra kosten voor zijn",
    path: ["extraCostsNote"],
  });

export async function POST(request: Request, props: { params: Promise<{ timesheetId: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    await enforceRateLimit({
      name: "timesheet-submit",
      identifier: principal.userId,
      limit: 30,
      windowSeconds: 600,
      message: "Te veel pogingen — probeer het over enkele minuten opnieuw.",
    });
    const input = schema.parse(await request.json());
    const profile = await prisma.freelancerProfile.findUnique({ where: { userId: principal.userId }, select: { id: true } });
    if (!profile) throw AppError.forbidden("Geen werknemersprofiel gevonden");
    const timesheet = await prisma.timesheet.findFirst({ where: { id: params.timesheetId, freelancerId: profile.id }, select: { id: true, status: true, scheduledStart: true, scheduledEnd: true, actualStart: true, actualEnd: true, breakMinutes: true, branch: { select: { tenantId: true } }, assignment: { select: { shiftId: true, shift: { select: { title: true } } } } } });
    if (!timesheet) throw AppError.notFound("Urenstaat niet gevonden");
    if (timesheet.status !== "DRAFT") throw AppError.precondition(`Deze urenstaat kan niet meer worden ingediend (${timesheet.status})`);
    // tijdens de klus is er alleen inchecken; de uren pas na de eindtijd of na het uitchecken (lib/timesheets/indienen.ts)
    if (!urenIndienenOpen(timesheet, Date.now())) throw AppError.precondition("Uren indienen kan pas als de klus voorbij is: na de eindtijd, of eerder als je al bent uitgecheckt.");
    const start = input.actualStart ? new Date(input.actualStart) : timesheet.actualStart ?? timesheet.scheduledStart;
    const end = input.actualEnd ? new Date(input.actualEnd) : timesheet.actualEnd ?? timesheet.scheduledEnd;
    if (end <= start) throw AppError.validation("De eindtijd moet na de starttijd liggen");
    const billableMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000) - input.breakMinutes);
    if (billableMinutes <= 0) throw AppError.validation("De urenstaat moet minstens één betaalbaar uur bevatten");
    // Geen uren zonder beoordeling van de opdrachtgever (er is geen Overslaan meer). Al beoordeeld voor deze klus
    // (bijvoorbeeld een herhaalde poging nadat de beoordeling al was opgeslagen) telt ook; dan niet nog een keer opslaan.
    const shiftId = timesheet.assignment?.shiftId;
    const tenantId = timesheet.branch.tenantId;
    const alBeoordeeld = await hasReviewed("company", tenantId, principal.userId, shiftId);
    if (!alBeoordeeld && !input.review) throw AppError.validation("Geef de opdrachtgever eerst een beoordeling (1 tot 5 sterren). Daarna kun je je uren indienen.");
    if (!alBeoordeeld && input.review) {
      const shiftTitle = timesheet.assignment?.shift.title;
      await addReview({
        subjectType: "company",
        subjectId: tenantId,
        authorId: principal.userId,
        authorName: principal.fullName,
        authorRole: "freelancer",
        rating: input.review.rating,
        text: input.review.text,
        ...(shiftId ? { shiftId } : {}),
        ...(shiftTitle ? { shiftTitle } : {}),
      });
    }
    const updated = await prisma.timesheet.update({ where: { id: timesheet.id }, data: { status: "SUBMITTED", actualStart: start, actualEnd: end, breakMinutes: input.breakMinutes, billableMinutes, submittedAt: new Date(), extraCostsCents: input.extraCostsCents ?? null, extraCostsNote: input.extraCostsCents ? (input.extraCostsNote ?? null) : null }, select: { id: true, status: true, billableMinutes: true } });
    await recordAudit({ category: "TIMESHEET", action: "timesheet.submitted", actorUserId: principal.userId, actorLabel: "user", summary: `Urenstaat ingediend: ${billableMinutes} minuten`, targetType: "timesheet", targetId: timesheet.id, metadata: { note: input.note ?? null, breakMinutes: input.breakMinutes, extraCostsCents: input.extraCostsCents ?? null } });
    // Tell the client now (the autopilot only reminds twice a day): approving sooner pays the worker sooner.
    if (shiftId) runAfter(() => pushHoursSubmitted(shiftId, timesheet.id, principal.fullName, billableMinutes));
    return NextResponse.json({ timesheet: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
