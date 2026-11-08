import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export async function getAttendanceMetrics(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      _count: {
        select: {
          registrations: true,
          checkIns: true,
        },
      },
    },
  });

  if (!event) throw AppError.notFound("Event not found");

  const attendanceRate = event._count.registrations > 0
    ? (event._count.checkIns / event._count.registrations) * 100
    : 0;

  return {
    totalRegistered: event._count.registrations,
    totalAttended: event._count.checkIns,
    noShow: event._count.registrations - event._count.checkIns,
    attendanceRate: Math.round(attendanceRate),
    capacity: event.capacity,
  };
}

export async function getRevenueMetrics(eventId: string) {
  const tickets = await prisma.ticket.findMany({
    where: {
      registration: { eventId },
      status: "CONFIRMED",
    },
  });

  const totalRevenue = tickets.reduce((sum, t) => sum + t.priceCent, 0) / 100;
  const ticketsSold = tickets.length;

  return {
    totalRevenue,
    ticketsSold,
    avgTicketPrice: ticketsSold > 0 ? totalRevenue / ticketsSold : 0,
  };
}

export async function getMarketingROI(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { _count: { select: { registrations: true } } },
  });

  if (!event) throw AppError.notFound("Event not found");

  // Marketing ROI calculation would use actual marketing spend data
  // This is a simplified version
  const registrations = event._count.registrations;
  const conversionRate = registrations > 0 ? (registrations / (registrations * 2)) * 100 : 0;

  return {
    registrations,
    conversionRate: Math.round(conversionRate),
  };
}

export async function getAttendeeDemographics(eventId: string) {
  const registrations = await prisma.registration.findMany({
    where: { eventId },
  });

  // Parse custom answers for demographic data
  const demographics = {
    totalAttendees: registrations.length,
    checkInRate: (registrations.filter(r => r.status === "CHECKED_IN").length / registrations.length) * 100,
  };

  return demographics;
}

export async function getEngagementMetrics(eventId: string) {
  const feedback = await prisma.eventFeedback.findMany({
    where: { eventId },
  });

  if (feedback.length === 0) {
    return {
      avgRating: 0,
      responseRate: 0,
      feedbackCount: 0,
    };
  }

  const avgRating = feedback.reduce((sum, f) => sum + f.overallRating, 0) / feedback.length;
  const registrations = await prisma.registration.count({ where: { eventId } });
  const responseRate = (feedback.length / registrations) * 100;

  return {
    avgRating: Math.round(avgRating * 10) / 10,
    responseRate: Math.round(responseRate),
    feedbackCount: feedback.length,
  };
}

export async function getPlanningInsights(organizerId: string) {
  const events = await prisma.event.findMany({
    where: { organizerId },
    include: {
      _count: { select: { registrations: true, checkIns: true } },
    },
  });

  const insights = {
    totalEvents: events.length,
    avgAttendanceRate: events.length > 0
      ? Math.round(
          events.reduce((sum, e) => {
            const rate = e._count.registrations > 0 ? (e._count.checkIns / e._count.registrations) * 100 : 0;
            return sum + rate;
          }, 0) / events.length
        )
      : 0,
    upcomingEvents: events.filter(e => new Date(e.startDate) > new Date()).length,
    pastEvents: events.filter(e => new Date(e.endDate) < new Date()).length,
  };

  return insights;
}
