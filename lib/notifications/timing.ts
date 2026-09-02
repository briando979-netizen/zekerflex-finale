// ---------------------------------------------------------------------------
// Behavioural notification timing.
//
// A freelancer can set a local "quiet hours" window. During that window the
// dispatcher still creates the offer (it shows in-app on next open) but skips
// the push ping. Pure function - unit tested, no infra.
// ---------------------------------------------------------------------------

export interface ContactWindow {
  timezone: string;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}

/** Hour-of-day (0-23) for an instant in the given IANA timezone. */
export function localHour(timezone: string, at: Date = new Date()): number {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    }).format(at);
    // "24" is emitted by some engines for midnight; normalise to 0.
    const n = Number.parseInt(hour, 10);
    return Number.isFinite(n) ? n % 24 : at.getUTCHours();
  } catch {
    // Unknown timezone string - fall back to UTC rather than throw.
    return at.getUTCHours();
  }
}

/**
 * True when a push ping may be sent now. When either bound is null the window is
 * disabled and pings are always allowed. The window wraps midnight when
 * `start > end` (e.g. 22 -> 7 covers 22:00-06:59).
 */
export function isWithinContactWindow(
  w: ContactWindow,
  at: Date = new Date(),
): boolean {
  const { quietHoursStart: start, quietHoursEnd: end } = w;
  if (start == null || end == null) return true;
  if (start === end) return true; // zero-length window == disabled

  const hour = localHour(w.timezone, at);
  const inQuiet =
    start < end
      ? hour >= start && hour < end
      : hour >= start || hour < end;
  return !inQuiet;
}

export interface ProfileTiming extends ContactWindow {
  /** Hours (0-23, local) learned from engagement events; [] when not learned. */
  learnedActiveHours: number[];
}

/**
 * May we send a push ping now? Behavioural Timing Notifier v2: if the profile
 * has learned active hours, the current local hour must be one of them;
 * otherwise fall back to the manual quiet-hours window.
 */
export function mayPingNow(t: ProfileTiming, at: Date = new Date()): boolean {
  if (t.learnedActiveHours.length > 0) {
    return t.learnedActiveHours.includes(localHour(t.timezone, at));
  }
  return isWithinContactWindow(t, at);
}
