import { describe, expect, it } from "vitest";
import { APP_OPEN_INTERVAL_MS, appOpenTelt } from "@/lib/engagement/app-open";

const NU = Date.parse("2026-11-09T15:00:00+01:00");

describe("appOpenTelt", () => {
  it("telt de eerste melding altijd", () => {
    expect(appOpenTelt(null, NU)).toBe(true);
  });

  it("telt hoogstens eens per half uur", () => {
    expect(appOpenTelt(NU - 5 * 60_000, NU)).toBe(false);
    expect(appOpenTelt(NU - APP_OPEN_INTERVAL_MS + 1, NU)).toBe(false);
    expect(appOpenTelt(NU - APP_OPEN_INTERVAL_MS, NU)).toBe(true);
    expect(appOpenTelt(NU - 3 * 60 * 60_000, NU)).toBe(true);
  });

  it("rommel of een tijd in de toekomst blokkeert niet", () => {
    expect(appOpenTelt(Number.NaN, NU)).toBe(true);
    expect(appOpenTelt(NU + 60_000, NU)).toBe(true);
  });
});
