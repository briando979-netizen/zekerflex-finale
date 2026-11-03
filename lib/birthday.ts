import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { isBirthdayOn } from "@/lib/seasons/calendar";

// Is a stored geboortedatum (YYYY-MM-DD, or just MM-DD) today? Month+day match
// only — the year is irrelevant for a birthday. "Today" is the Dutch calendar
// day: the server runs in UTC, so between midnight and 01:00/02:00 the UTC date
// would still be yesterday. Returns false for missing/malformed dates.
export function isBirthdayToday(birthDate: string | null | undefined, now = new Date()): boolean {
  return isBirthdayOn(birthDate, amsterdamDayKey(now));
}
