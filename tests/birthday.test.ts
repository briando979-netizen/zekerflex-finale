import { describe, expect, it } from "vitest";
import { isBirthdayToday } from "@/lib/birthday";

describe("isBirthdayToday", () => {
  const now = new Date("2026-10-23T09:00:00Z");

  it("matches on month+day regardless of year", () => {
    expect(isBirthdayToday("1990-10-23", now)).toBe(true);
    expect(isBirthdayToday("2001-10-23", now)).toBe(true);
  });

  it("is false on other days", () => {
    expect(isBirthdayToday("1990-10-24", now)).toBe(false);
    expect(isBirthdayToday("1990-11-23", now)).toBe(false);
  });

  it("is false for missing or malformed dates", () => {
    expect(isBirthdayToday(null, now)).toBe(false);
    expect(isBirthdayToday(undefined, now)).toBe(false);
    expect(isBirthdayToday("", now)).toBe(false);
    expect(isBirthdayToday("23-10-1990", now)).toBe(false);
  });
});
