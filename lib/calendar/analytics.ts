import { prisma } from "@/lib/prisma";

export async function getCalendarAnalytics(userId: string, startDate: Date, endDate: Date) {
  const calendars = await prisma.calendar.findMany({ where: { userId } });
  const events = await prisma.calendarEvent.findMany({
    where: {
      calendarId: { in: calendars.map((c) => c.id) },
      startTime: { gte: startDate },
      endTime: { lte: endDate },
    },
  });

  const totalMinutes = events.reduce(
    (sum, e) => sum + (e.endTime.getTime() - e.startTime.getTime()) / 60000,
    0
  );

  const eventCount = events.length;
  const avgMeetingLength = eventCount > 0 ? totalMinutes / eventCount : 0;

  const freeTimePercent =
    (1 - totalMinutes / ((endDate.getTime() - startDate.getTime()) / 60000)) *
    100;

  return {
    totalMinutes: Math.round(totalMinutes),
    eventCount,
    avgMeetingLength: Math.round(avgMeetingLength),
    freeTimePercent: Math.round(freeTimePercent),
  };
}

export async function getMeetingEfficiency(userId: string) {
  const calendars = await prisma.calendar.findMany({ where: { userId } });

  const events = await prisma.calendarEvent.findMany({
    where: {
      calendarId: { in: calendars.map((c) => c.id) },
      startTime: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  const backToBackCount = events.filter((e, i) => {
    if (i === 0) return false;
    const prevEvent = events[i - 1];
    const gap = (e.startTime.getTime() - prevEvent.endTime.getTime()) / 60000;
    return gap <= 5;
  }).length;

  const averageGapMinutes = (() => {
    let totalGap = 0;
    let gapCount = 0;
    for (let i = 1; i < events.length; i++) {
      const gap =
        (events[i].startTime.getTime() - events[i - 1].endTime.getTime()) /
        60000;
      if (gap > 0) {
        totalGap += gap;
        gapCount++;
      }
    }
    return gapCount > 0 ? totalGap / gapCount : 0;
  })();

  return {
    backToBackMeetings: backToBackCount,
    averageGapMinutes: Math.round(averageGapMinutes),
    efficiency: Math.max(0, 100 - backToBackCount * 5),
  };
}

export async function getSchedulingPatterns(userId: string) {
  const calendars = await prisma.calendar.findMany({ where: { userId } });

  const events = await prisma.calendarEvent.findMany({
    where: {
      calendarId: { in: calendars.map((c) => c.id) },
      startTime: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
  });

  const byHour: Record<number, number> = {};
  const byDay: Record<number, number> = {};

  for (const event of events) {
    const hour = event.startTime.getHours();
    const day = event.startTime.getDay();

    byHour[hour] = (byHour[hour] || 0) + 1;
    byDay[day] = (byDay[day] || 0) + 1;
  }

  const peakHour = Object.entries(byHour).sort(([, a], [, b]) => b - a)[0];
  const peakDay = Object.entries(byDay).sort(([, a], [, b]) => b - a)[0];

  return {
    peakHour: peakHour ? parseInt(peakHour[0]) : 10,
    peakDay: peakDay ? parseInt(peakDay[0]) : 2,
    distributionByHour: byHour,
    distributionByDay: byDay,
  };
}

export async function getResourceUtilization(userId: string) {
  const calendars = await prisma.calendar.findMany({ where: { userId } });

  const total30Days = 30 * 24 * 60;
  const busyMinutes = await prisma.calendarEvent.aggregate({
    where: {
      calendarId: { in: calendars.map((c) => c.id) },
      startTime: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    _sum: {
      duration: true,
    },
  });

  const utilization =
    ((busyMinutes._sum.duration || 0) / total30Days) * 100;

  return {
    utilization: Math.round(utilization),
    recommendedMax: 50,
    isOverbooked: utilization > 70,
  };
}

export async function getTimeUsage(userId: string) {
  const calendars = await prisma.calendar.findMany({ where: { userId } });

  const events = await prisma.calendarEvent.findMany({
    where: {
      calendarId: { in: calendars.map((c) => c.id) },
      startTime: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  const byCategory: Record<string, number> = {};

  for (const event of events) {
    const duration =
      (event.endTime.getTime() - event.startTime.getTime()) / 60000;
    const category = event.title.includes("1:1")
      ? "1:1s"
      : event.title.includes("team")
        ? "team"
        : event.title.includes("focus")
          ? "focus"
          : "other";

    byCategory[category] = (byCategory[category] || 0) + duration;
  }

  return byCategory;
}
