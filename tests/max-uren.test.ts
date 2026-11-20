import { describe, expect, it } from "vitest";
import { dienstUren, pastBinnenMaxUren } from "@/lib/werkgever/max-uren-kern";

// Maximum uren per werker bij één bedrijf (20 nov 2026): gewerkt + ingepland tegen de grens van het bedrijf.

describe("max uren per werker", () => {
  it("dienstUren trekt de pauze af en wordt nooit negatief", () => {
    expect(dienstUren({ startsAt: new Date("2026-12-08T08:00:00Z"), endsAt: new Date("2026-12-08T14:00:00Z"), breakMinutes: 30 })).toBe(5.5);
    expect(dienstUren({ startsAt: new Date("2026-12-08T08:00:00Z"), endsAt: new Date("2026-12-08T08:10:00Z"), breakMinutes: 30 })).toBe(0);
  });

  it("zonder grens past alles; met grens telt gewerkt plus nieuw", () => {
    expect(pastBinnenMaxUren(900, 8, undefined)).toBe(true);
    expect(pastBinnenMaxUren(900, 8, 0)).toBe(true);
    expect(pastBinnenMaxUren(640, 8, 650)).toBe(true);
    expect(pastBinnenMaxUren(645, 8, 650)).toBe(false);
    expect(pastBinnenMaxUren(650, 0, 650)).toBe(true);
  });
});
