import { describe, expect, it } from "vitest";
import {
  isWithinContactWindow,
  localHour,
} from "@/lib/notifications/timing";

const at = (hourUtc: number) =>
  new Date(Date.UTC(2026, 7, 15, hourUtc, 30, 0)); // 15 Aug 2026, HH:30 UTC

describe("localHour", () => {
  it("reads the hour in the given timezone", () => {
    expect(localHour("UTC", at(9))).toBe(9);
    expect(localHour("UTC", at(0))).toBe(0);
  });

  it("falls back to UTC for an unknown timezone instead of throwing", () => {
    expect(localHour("Mars/Olympus", at(14))).toBe(14);
  });
});

describe("isWithinContactWindow", () => {
  const tz = "UTC";

  it("allows pings when the window is disabled", () => {
    expect(
      isWithinContactWindow(
        { timezone: tz, quietHoursStart: null, quietHoursEnd: null },
        at(3),
      ),
    ).toBe(true);
    expect(
      isWithinContactWindow(
        { timezone: tz, quietHoursStart: 22, quietHoursEnd: null },
        at(3),
      ),
    ).toBe(true);
  });

  it("suppresses pings inside a midnight-wrapping quiet window (23->7)", () => {
    const w = { timezone: tz, quietHoursStart: 23, quietHoursEnd: 7 };
    expect(isWithinContactWindow(w, at(2))).toBe(false);
    expect(isWithinContactWindow(w, at(23))).toBe(false);
    expect(isWithinContactWindow(w, at(6))).toBe(false);
    expect(isWithinContactWindow(w, at(7))).toBe(true);
    expect(isWithinContactWindow(w, at(12))).toBe(true);
    expect(isWithinContactWindow(w, at(22))).toBe(true);
  });

  it("suppresses pings inside a same-day quiet window (9->17)", () => {
    const w = { timezone: tz, quietHoursStart: 9, quietHoursEnd: 17 };
    expect(isWithinContactWindow(w, at(12))).toBe(false);
    expect(isWithinContactWindow(w, at(8))).toBe(true);
    expect(isWithinContactWindow(w, at(17))).toBe(true);
  });

  it("treats a zero-length window (start === end) as disabled", () => {
    expect(
      isWithinContactWindow(
        { timezone: tz, quietHoursStart: 8, quietHoursEnd: 8 },
        at(8),
      ),
    ).toBe(true);
  });
});
