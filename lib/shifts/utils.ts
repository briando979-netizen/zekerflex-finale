import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications/dispatch";

export async function notifyFreelancersOfNewShift(shiftId: string) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { company: true },
  });

  if (!shift) {
    throw new Error("Shift not found");
  }

  const matchingFreelancers = await prisma.freelancerProfile.findMany({
    where: {
      active: true,
      availabilitySlots: {
        some: {
          day: getDayName(shift.startsAt),
        },
      },
    },
    take: 50,
  });

  for (const freelancer of matchingFreelancers) {
    await sendNotification(
      freelancer.userId,
      "shift_available",
      `Nieuwe klus beschikbaar bij ${shift.company.name}`,
      `${shift.title || "Klus"} op ${shift.startsAt.toLocaleDateString("nl-NL")}`,
      { shiftId },
    );
  }
}

export async function autoMatchShiftToFreelancers(shiftId: string) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
  });

  if (!shift) {
    throw new Error("Shift not found");
  }

  const freelancers = await prisma.freelancerProfile.findMany({
    where: {
      active: true,
      NOT: { assignments: { some: { shiftId } } },
    },
    take: 5,
  });

  for (const freelancer of freelancers) {
    await prisma.shiftSuggestion.create({
      data: {
        shiftId,
        freelancerId: freelancer.id,
        score: 75 + Math.random() * 25,
      },
    });
  }
}

function getDayName(date: Date): string {
  const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  return days[date.getDay()];
}

export async function cancelShiftAndNotify(shiftId: string, reason: string) {
  const assignments = await prisma.shiftAssignment.findMany({
    where: { shiftId, status: { in: ["ACCEPTED", "IN_PROGRESS"] } },
    include: { freelancer: { select: { userId: true } } },
  });

  for (const assignment of assignments) {
    await prisma.shiftAssignment.update({
      where: { id: assignment.id },
      data: { status: "CANCELLED" },
    });

    await sendNotification(assignment.freelancer.userId, "shift_available", "Klus geannuleerd", reason);
  }

  await prisma.shift.update({
    where: { id: shiftId },
    data: { status: "CANCELLED" },
  });
}
