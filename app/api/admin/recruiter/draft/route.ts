import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { draftOutreach } from "@/lib/recruiter/draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  shiftId: z.string().min(1).max(60),
  freelancerId: z.string().min(1).max(60),
  channel: z.enum(["whatsapp", "email", "chat"]),
  highlights: z.array(z.string().max(200)).max(8).optional(),
});

// POST /api/admin/recruiter/draft — AI-concept-outreach voor één kandidaat.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Controleer de gegevens");
  const { shiftId, freelancerId, channel, highlights } = parsed.data;

  const [shift, freelancer] = await Promise.all([
    prisma.shift.findUnique({
      where: { id: shiftId },
      select: { title: true, startsAt: true, hourlyRateCents: true, branch: { select: { city: true } } },
    }),
    prisma.freelancerProfile.findUnique({ where: { id: freelancerId }, select: { user: { select: { fullName: true } } } }),
  ]);
  if (!shift) throw AppError.notFound("Vacature niet gevonden");
  if (!freelancer) throw AppError.notFound("Kandidaat niet gevonden");

  const dateLabel = shift.startsAt.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Amsterdam",
  });
  const hourlyRate = `€ ${(shift.hourlyRateCents / 100).toFixed(2).replace(".", ",")}`;

  const result = await draftOutreach({
    candidateName: freelancer.user.fullName,
    vacancyTitle: shift.title,
    city: shift.branch.city,
    dateLabel,
    hourlyRate,
    channel,
    ...(highlights && highlights.length ? { highlights } : {}),
  });

  return NextResponse.json(result);
});
