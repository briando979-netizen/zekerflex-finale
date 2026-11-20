import { describe, expect, it } from "vitest";
import { afzegDeadline, ANNULEER_TERMIJNEN, annuleerTermijnLabel, annuleerUrenOf, isAnnuleerTermijn, STANDAARD_ANNULEER_UREN } from "@/lib/shifts/annuleertermijn";
import { NOTICE_HOURS } from "@/lib/claims/policy";
import { createShiftSchema } from "@/lib/shifts/create";

// Annuleringstermijn per klus (20 nov 2026): het bedrijf kiest 24/48/72/168 uur; zonder keuze geldt wat het platform
// altijd al beloofde (NOTICE_HOURS). De werker ziet de termijn van de klus, niet een vast getal.

describe("lib/shifts/annuleertermijn", () => {
  it("de standaard is de platformbelofte uit lib/claims/policy en zit in de keuzelijst", () => {
    expect(STANDAARD_ANNULEER_UREN).toBe(NOTICE_HOURS);
    expect(isAnnuleerTermijn(STANDAARD_ANNULEER_UREN)).toBe(true);
    expect(ANNULEER_TERMIJNEN).toEqual([24, 48, 72, 168]);
  });

  it("een onbekende waarde valt terug op de standaard", () => {
    expect(annuleerUrenOf(36)).toBe(STANDAARD_ANNULEER_UREN);
    expect(annuleerUrenOf(null)).toBe(STANDAARD_ANNULEER_UREN);
    expect(annuleerUrenOf(undefined)).toBe(STANDAARD_ANNULEER_UREN);
    expect(annuleerUrenOf(72)).toBe(72);
  });

  it("labels in het Nederlands en Engels", () => {
    expect(annuleerTermijnLabel(24)).toBe("24 uur");
    expect(annuleerTermijnLabel(48)).toBe("2 dagen");
    expect(annuleerTermijnLabel(72)).toBe("3 dagen");
    expect(annuleerTermijnLabel(168)).toBe("1 week");
    expect(annuleerTermijnLabel(168, "en")).toBe("1 week");
    expect(annuleerTermijnLabel(48, "en")).toBe("2 days");
    expect(annuleerTermijnLabel(24, "en")).toBe("24 hours");
  });

  it("afzegDeadline telt de termijn terug vanaf de start (met een zone, geen tijdbom)", () => {
    const start = new Date("2027-03-10T09:00:00+01:00");
    expect(afzegDeadline(start, 48).toISOString()).toBe(new Date("2027-03-08T09:00:00+01:00").toISOString());
    // onbekende termijn: de standaard
    expect(afzegDeadline(start, 36).getTime()).toBe(start.getTime() - STANDAARD_ANNULEER_UREN * 3_600_000);
  });
});

describe("createShiftSchema: annuleerUren", () => {
  const base = { branchId: "b1", title: "Bediening terras", startsAt: "2027-01-10T09:00", endsAt: "2027-01-10T17:00", hourlyRateCents: 1700 };

  it("zonder keuze de standaard", () => {
    const r = createShiftSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.annuleerUren).toBe(STANDAARD_ANNULEER_UREN);
  });

  it("een keuze uit de lijst mag, ook als tekst uit een formulier", () => {
    const r = createShiftSchema.safeParse({ ...base, annuleerUren: "168" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.annuleerUren).toBe(168);
  });

  it("een termijn buiten de lijst wordt geweigerd", () => {
    expect(createShiftSchema.safeParse({ ...base, annuleerUren: 36 }).success).toBe(false);
    expect(createShiftSchema.safeParse({ ...base, annuleerUren: 0 }).success).toBe(false);
  });
});
