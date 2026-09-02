import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { claimsForFreelancer, existingClaimFor, fileClaim } from "@/lib/claims/store";
import { ensureDirectThread, postMessage } from "@/lib/messaging/store";
import { resolveShiftContact } from "@/lib/messaging/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/claims — my cancellation claims.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ claims: await claimsForFreelancer(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({ shiftId: z.string().min(1), reason: z.string().trim().max(800).default("") });

// POST /api/me/claims — file a 50% claim after the employer cancelled a shift you were on.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const me = await requirePrincipal();
    const { shiftId, reason } = schema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: me.userId },
      select: { id: true, user: { select: { fullName: true } } },
    });
    if (!profile) throw AppError.forbidden("Geen freelancer-profiel.");

    const assignment = await prisma.shiftAssignment.findFirst({
      where: { shiftId, freelancerId: profile.id },
      select: {
        id: true,
        cancelledAt: true,
        cancelReason: true,
        shift: {
          select: {
            title: true,
            status: true,
            startsAt: true,
            endsAt: true,
            breakMinutes: true,
            hourlyRateCents: true,
            branch: { select: { name: true } },
          },
        },
      },
    });
    if (!assignment) throw AppError.forbidden("Je was niet toegewezen aan deze dienst.");
    const cancelledByEmployer =
      assignment.shift.status === "CANCELLED" &&
      assignment.cancelledAt &&
      (assignment.cancelReason ?? "").toLowerCase().includes("opdrachtgever");
    if (!cancelledByEmployer) {
      throw AppError.validation("Je kunt alleen claimen als de opdrachtgever de dienst heeft geannuleerd.");
    }
    if (await existingClaimFor(shiftId, me.userId)) {
      throw AppError.validation("Je hebt hier al een claim voor ingediend.");
    }

    const hours = Math.max(
      0,
      (assignment.shift.endsAt.getTime() - assignment.shift.startsAt.getTime()) / 3_600_000 -
        assignment.shift.breakMinutes / 60,
    );
    const seatValueCents = Math.round(hours * assignment.shift.hourlyRateCents);
    const contact = await resolveShiftContact(shiftId);

    const claim = await fileClaim({
      shiftId,
      shiftTitle: assignment.shift.title,
      assignmentId: assignment.id,
      freelancerUserId: me.userId,
      freelancerName: profile.user.fullName,
      employerUserId: contact?.userId ?? null,
      branchName: assignment.shift.branch.name,
      shiftValueCents: seatValueCents,
      reason: reason || "Dienst geannuleerd door opdrachtgever nadat ik was ingepland.",
    });

    // notify the employer in chat
    if (contact) {
      try {
        const t = await ensureDirectThread(me.userId, contact.userId, {
          contextKey: `shift:${shiftId}`,
          shiftId,
          shiftTitle: assignment.shift.title,
        });
        await postMessage(
          t.id,
          "system",
          `${profile.user.fullName} heeft een annuleringsclaim ingediend voor 50% (${new Intl.NumberFormat("nl-NL", {
            style: "currency",
            currency: "EUR",
          }).format(claim.claimedCents / 100)}). Beoordeel de claim in je diensten-overzicht.`,
          "system",
        );
      } catch {
        /* non-fatal */
      }
    }

    return NextResponse.json({ claim }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
