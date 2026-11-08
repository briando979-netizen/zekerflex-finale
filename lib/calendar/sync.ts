import { prisma } from "@/lib/prisma";

interface SyncProvider {
  type: "google" | "outlook" | "ical" | "apple";
  accessToken?: string;
  refreshToken?: string;
  externalCalendarId?: string;
}

export async function linkCalendarProvider(
  userId: string,
  calendarId: string,
  provider: SyncProvider
) {
  return prisma.calendarIntegration.create({
    data: {
      userId,
      calendarId,
      provider: provider.type,
      accessToken: provider.accessToken,
      refreshToken: provider.refreshToken,
      externalId: provider.externalCalendarId,
    },
  });
}

export async function syncGoogleCalendar(
  userId: string,
  calendarId: string,
  integration: any
) {
  try {
    const googleEvents = await fetchGoogleCalendarEvents(integration.accessToken);

    for (const gEvent of googleEvents) {
      const existing = await prisma.calendarEvent.findFirst({
        where: {
          externalEventId: gEvent.id,
          calendarId,
        },
      });

      if (existing) {
        await prisma.calendarEvent.update({
          where: { id: existing.id },
          data: {
            title: gEvent.summary,
            description: gEvent.description,
            startTime: new Date(gEvent.start.dateTime),
            endTime: new Date(gEvent.end.dateTime),
          },
        });
      } else {
        await prisma.calendarEvent.create({
          data: {
            calendarId,
            title: gEvent.summary,
            description: gEvent.description,
            startTime: new Date(gEvent.start.dateTime),
            endTime: new Date(gEvent.end.dateTime),
            externalEventId: gEvent.id,
            externalProvider: "google",
          },
        });
      }
    }

    return { synced: googleEvents.length };
  } catch (err) {
    throw new Error(`Google Calendar sync failed: ${err}`);
  }
}

export async function syncOutlookCalendar(
  userId: string,
  calendarId: string,
  integration: any
) {
  try {
    const outlookEvents = await fetchOutlookCalendarEvents(
      integration.accessToken
    );

    for (const oEvent of outlookEvents) {
      const existing = await prisma.calendarEvent.findFirst({
        where: {
          externalEventId: oEvent.id,
          calendarId,
        },
      });

      if (existing) {
        await prisma.calendarEvent.update({
          where: { id: existing.id },
          data: {
            title: oEvent.subject,
            description: oEvent.bodyPreview,
            startTime: new Date(oEvent.start.dateTime),
            endTime: new Date(oEvent.end.dateTime),
          },
        });
      } else {
        await prisma.calendarEvent.create({
          data: {
            calendarId,
            title: oEvent.subject,
            description: oEvent.bodyPreview,
            startTime: new Date(oEvent.start.dateTime),
            endTime: new Date(oEvent.end.dateTime),
            externalEventId: oEvent.id,
            externalProvider: "outlook",
          },
        });
      }
    }

    return { synced: outlookEvents.length };
  } catch (err) {
    throw new Error(`Outlook Calendar sync failed: ${err}`);
  }
}

async function fetchGoogleCalendarEvents(token: string) {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const data = await res.json();
  return data.items || [];
}

async function fetchOutlookCalendarEvents(token: string) {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/calendarview", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.value || [];
}

export async function exportToIcal(calendarId: string): Promise<string> {
  const calendar = await prisma.calendar.findUnique({
    where: { id: calendarId },
    include: { events: true },
  });

  if (!calendar) throw new Error("Calendar not found");

  let ical = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//ZekerFlex//Calendar//EN\n`;

  for (const event of calendar.events) {
    ical += `BEGIN:VEVENT\n`;
    ical += `UID:${event.id}\n`;
    ical += `DTSTART:${event.startTime.toISOString()}\n`;
    ical += `DTEND:${event.endTime.toISOString()}\n`;
    ical += `SUMMARY:${event.title}\n`;
    if (event.description) ical += `DESCRIPTION:${event.description}\n`;
    ical += `END:VEVENT\n`;
  }

  ical += `END:VCALENDAR`;
  return ical;
}
