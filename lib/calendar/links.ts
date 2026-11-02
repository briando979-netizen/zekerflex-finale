// ---------------------------------------------------------------------------
// Calendar deep-links. Pure string helpers (safe in client components) that
// build "add to calendar" URLs for Google Calendar and Outlook.com, plus a
// local wall-clock formatter shared with the .ics route so every channel shows
// the same start/end time.
// ---------------------------------------------------------------------------

import { amsterdamParts } from "@/lib/time/amsterdam";

export interface CalendarEvent {
  title: string;
  /** Local wall-clock, "YYYY-MM-DDTHH:mm:ss" (no timezone marker). */
  startLocal: string;
  endLocal: string;
  location: string;
  description: string;
}

const TZ = "Europe/Amsterdam";

/** "2026-09-08T11:00:00" -> "20260908T110000" */
const compact = (local: string) => local.replace(/[-:]/g, "").replace(/\.\d+$/, "");

/** Amsterdam wall-clock of an instant — the links declare `ctz` Europe/Amsterdam,
 *  so the server's own (UTC) clock would put the event an hour or two early. */
export function localStamp(d: Date | string): string {
  const x = amsterdamParts(new Date(d));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.year}-${p(x.month)}-${p(x.day)}T${p(x.hour)}:${p(x.minute)}:00`;
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${compact(e.startLocal)}/${compact(e.endLocal)}`,
    details: e.description,
    location: e.location,
    ctz: TZ,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function outlookCalendarUrl(e: CalendarEvent): string {
  const q = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: e.title,
    startdt: e.startLocal,
    enddt: e.endLocal,
    body: e.description,
    location: e.location,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q.toString()}`;
}
