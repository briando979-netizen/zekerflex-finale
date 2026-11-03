import { describe, expect, it } from "vitest";
import { isVacaturePad, verlopen, wisDatum } from "@/lib/voorstel/sollicitatie-regels";

describe("sollicitaties", () => {
  it("accepteert alleen vacaturepaden", () => {
    expect(isVacaturePad("/vacatures")).toBe(true);
    expect(isVacaturePad("/vacatures/zelfstandig-werkend-kok")).toBe(true);
    expect(isVacaturePad("/restaurant/bbq")).toBe(false);
    expect(isVacaturePad("/vacatures/../contact")).toBe(false);
    expect(isVacaturePad("/vacatures/")).toBe(false);
  });

  it("wist 4 weken na de laatste wijziging", () => {
    const bijgewerkt = "2026-11-03T10:00:00.000Z";
    expect(wisDatum(bijgewerkt).toISOString()).toBe("2026-12-01T10:00:00.000Z");
    expect(verlopen(bijgewerkt, Date.parse("2026-11-30T10:00:00Z"))).toBe(false);
    expect(verlopen(bijgewerkt, Date.parse("2026-12-01T10:00:00Z"))).toBe(true);
  });
});
