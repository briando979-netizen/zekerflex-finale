import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export async function checkIn(eventId: string, qrCodeToken: string) {
  const registration = await prisma.registration.findUnique({
    where: { qrCodeToken },
  });

  if (!registration) throw AppError.notFound("Registration not found");
  if (registration.eventId !== eventId) throw AppError.forbidden("Registration does not match event");
  if (registration.status === "CANCELLED") throw new Error("Registration cancelled");

  const checkIn = await prisma.checkIn.create({
    data: {
      registrationId: registration.id,
      eventId,
      checkedInAt: new Date(),
    },
  });

  await prisma.registration.update({
    where: { id: registration.id },
    data: { status: "CHECKED_IN" },
  });

  return checkIn;
}

export async function getCheckedInCount(eventId: string) {
  return prisma.checkIn.count({
    where: { eventId },
  });
}

export async function getNoShowCount(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  if (!event) throw AppError.notFound("Event not found");

  const registrations = await prisma.registration.count({
    where: { eventId, status: "CONFIRMED" },
  });

  const checkedIn = await getCheckedInCount(eventId);
  return registrations - checkedIn;
}

export async function getCheckInList(eventId: string) {
  return prisma.checkIn.findMany({
    where: { eventId },
    include: {
      registration: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { checkedInAt: "desc" },
  });
}

export async function getAttendanceStats(eventId: string) {
  const totalRegistered = await prisma.registration.count({
    where: { eventId },
  });

  const checkedIn = await getCheckedInCount(eventId);
  const noShow = totalRegistered - checkedIn;
  const attendanceRate = totalRegistered > 0 ? (checkedIn / totalRegistered) * 100 : 0;

  return {
    totalRegistered,
    checkedIn,
    noShow,
    attendanceRate: Math.round(attendanceRate),
  };
}

export async function exportCheckInList(eventId: string) {
  const checkIns = await getCheckInList(eventId);

  return checkIns.map((ci) => ({
    firstName: ci.registration.firstName,
    lastName: ci.registration.lastName,
    email: ci.registration.email,
    checkedInAt: ci.checkedInAt.toISOString(),
  }));
}
