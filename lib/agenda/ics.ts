import { amsterdamToUtc, isKnownTimeZone, zonedToUtc } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// iCalendar (RFC 5545) VEVENT reader for invitations that arrive by mail —
// Outlook, Google Calendar, Apple, Teams/Zoom invites. Floating times and
// Windows zone names (Outlook's "W. Europe Standard Time") are read as
// Amsterdam time; IANA zones are converted properly.
// ---------------------------------------------------------------------------

export interface IcsEvent {
  uid: string | null;
  summary: string | null;
  location: string | null;
  start: Date;
  end: Date | null;
  allDay: boolean;
  cancelled: boolean;
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

function parseDate(value: string, params: string[]): { date: Date; allDay: boolean } | null {
  const isDate = params.some((p) => /^VALUE=DATE$/i.test(p)) || /^\d{8}$/.test(value);
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (isDate || !m[4]) return { date: amsterdamToUtc(y, mo, d), allDay: true };
  const [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6])];
  if (m[7]) return { date: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), allDay: false };
  const tzid = params.find((p) => /^TZID=/i.test(p))?.slice(5).replace(/^"|"$/g, "");
  const zone = tzid && isKnownTimeZone(tzid) ? tzid : "Europe/Amsterdam";
  return { date: zonedToUtc(zone, y, mo, d, h, mi, s), allDay: false };
}

export function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const cancelCalendar = lines.some((l) => /^METHOD:CANCEL$/i.test(l.trim()));
  const events: IcsEvent[] = [];
  let cur: Partial<IcsEvent> & { startRaw?: { date: Date; allDay: boolean } | null; endRaw?: { date: Date; allDay: boolean } | null } | null = null;

  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (upper === "END:VEVENT") {
      if (cur?.startRaw) {
        events.push({
          uid: cur.uid ?? null,
          summary: cur.summary ?? null,
          location: cur.location ?? null,
          start: cur.startRaw.date,
          end: cur.endRaw?.date ?? null,
          allDay: cur.startRaw.allDay,
          cancelled: cancelCalendar || cur.cancelled === true,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const sep = line.indexOf(":");
    if (sep <= 0) continue;
    const [name, ...params] = line.slice(0, sep).split(";");
    const value = line.slice(sep + 1);
    switch ((name ?? "").toUpperCase()) {
      case "UID":
        cur.uid = value.trim();
        break;
      case "SUMMARY":
        cur.summary = unescapeText(value) || null;
        break;
      case "LOCATION":
        cur.location = unescapeText(value) || null;
        break;
      case "DTSTART":
        cur.startRaw = parseDate(value, params);
        break;
      case "DTEND":
        cur.endRaw = parseDate(value, params);
        break;
      case "STATUS":
        cur.cancelled = /CANCELLED/i.test(value);
        break;
    }
  }
  return events;
}
