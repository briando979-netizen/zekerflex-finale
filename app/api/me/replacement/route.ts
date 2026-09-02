import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toErrorBody, AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { createReplacementRequest, openReplacementForAssignment } from "@/lib/replacements/store";
import { sendMail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/replacement { assignmentId, note }
// Logs a substitute request to storage/replacements + e-mails ops. Does NOT
// modify the ShiftAssignment — a human/operator reassigns.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { assignmentId, note } = z
      .object({ assignmentId: z.string().min(1).max(128), note: z.string().trim().max(400).optional() })
      .parse(await request.json().catch(() => ({})));

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    if (!profile) throw AppError.forbidden("Geen freelancer-profiel");

    const assignment = await prisma.shiftAssignment.findFirst({
      where: { id: assignmentId, freelancerId: profile.id, cancelledAt: null },
      select: {
        id: true,
        shift: {
          select: { id: true, title: true, startsAt: true, branch: { select: { name: true } } },
        },
      },
    });
    if (!assignment) throw AppError.notFound("Dienst niet gevonden");
    if (assignment.shift.startsAt.getTime() < Date.now()) {
      throw AppError.precondition("Deze dienst is al begonnen.");
    }
    if (await openReplacementForAssignment(principal.userId, assignmentId)) {
      throw AppError.conflict("Je hebt hiervoor al een vervanger aangevraagd.");
    }

    const rec = await createReplacementRequest({
      userId: principal.userId,
      freelancerName: principal.fullName,
      assignmentId,
      shiftId: assignment.shift.id,
      shiftTitle: assignment.shift.title,
      branch: assignment.shift.branch.name,
      startsAt: assignment.shift.startsAt.toISOString(),
      note: note ?? "",
    });

    await sendMail({
      to: env.MAIL_ADMIN,
      subject: `Vervanger gevraagd — ${assignment.shift.title}`,
      kind: "replacement",
      text:
        `${principal.fullName} kan de dienst "${assignment.shift.title}" bij ${assignment.shift.branch.name} ` +
        `op ${assignment.shift.startsAt.toLocaleString("nl-NL")} niet doen.\n\n` +
        `${note ? `Toelichting: ${note}\n\n` : ""}` +
        `Verzoek-id: ${rec.id}. Herplaats de dienst of wijs een vervanger toe via de matching.`,
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, id: rec.id });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
