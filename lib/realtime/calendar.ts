export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  status: "available" | "booked" | "blocked" | "pending";
  bookedBy?: string;
  conflictDetected?: boolean;
}

const calendarEvents = new Map<string, CalendarEvent[]>();
const calendarListeners = new Map<string, Set<(event: CalendarEvent) => void>>();

export function subscribeCalendar(userId: string, listener: (event: CalendarEvent) => void) {
  if (!calendarListeners.has(userId)) {
    calendarListeners.set(userId, new Set());
  }
  calendarListeners.get(userId)?.add(listener);
  return () => calendarListeners.get(userId)?.delete(listener);
}

export function addCalendarEvent(userId: string, event: Omit<CalendarEvent, "id" | "conflictDetected">) {
  // Check for conflicts
  const events = calendarEvents.get(userId) ?? [];
  const hasConflict = events.some(
    (e) =>
      e.status === "booked" &&
      e.startTime < event.endTime &&
      e.endTime > event.startTime
  );

  const calEvent: CalendarEvent = {
    ...event,
    id: `cal-${Date.now()}`,
    conflictDetected: hasConflict,
  };

  if (hasConflict) {
    // Notify about conflict
    const listeners = calendarListeners.get(userId);
    if (listeners) {
      listeners.forEach((l) =>
        l({
          ...calEvent,
          id: `conflict-${Date.now()}`,
          title: "Conflict Detected",
          status: "pending",
        })
      );
    }
  } else {
    events.unshift(calEvent);
    calendarEvents.set(userId, events);

    const listeners = calendarListeners.get(userId);
    if (listeners) {
      listeners.forEach((l) => l(calEvent));
    }
  }

  return calEvent;
}

export function getCalendarEvents(userId: string, startDate: Date, endDate: Date): CalendarEvent[] {
  const events = calendarEvents.get(userId) ?? [];
  return events.filter((e) => e.startTime <= endDate && e.endTime >= startDate);
}

export function checkAvailability(userId: string, startTime: Date, endTime: Date): boolean {
  const events = calendarEvents.get(userId) ?? [];
  return !events.some(
    (e) =>
      e.status === "booked" &&
      e.startTime < endTime &&
      e.endTime > startTime
  );
}

export function blockTime(userId: string, title: string, startTime: Date, endTime: Date) {
  return addCalendarEvent(userId, {
    title,
    startTime,
    endTime,
    status: "blocked",
    userId,
  });
}

export function bookSlot(userId: string, bookedBy: string, title: string, startTime: Date, endTime: Date) {
  return addCalendarEvent(userId, {
    title,
    startTime,
    endTime,
    status: "booked",
    bookedBy,
    userId,
  });
}

export function getSlotsForDateRange(userId: string, startDate: Date, endDate: Date) {
  return getCalendarEvents(userId, startDate, endDate);
}
