import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { telOpkomst, type OpkomstRij } from "@/lib/employer/opkomst-kern";

// Opkomst op de reactie-rij van het bedrijf (20 nov 2026, zoals Temper/YoungOnes): dezelfde telling als de profielkaart.

const now = new Date("2026-11-20T12:00:00+01:00");
const voorbij = new Date("2026-11-10T17:00:00+01:00");
const straks = new Date("2026-12-01T17:00:00+01:00");

const rij = (p: Partial<OpkomstRij> & { endsAt?: Date }): OpkomstRij => ({
  cancelledAt: null,
  cancelReason: null,
  timesheet: null,
  shift: { endsAt: p.endsAt ?? voorbij },
  ...p,
});

describe("telOpkomst", () => {
  it("zonder afgelopen diensten is er geen percentage", () => {
    expect(telOpkomst([], now).attendancePct).toBeNull();
    expect(telOpkomst([rij({ endsAt: straks })], now).attendancePct).toBeNull();
  });

  it("ingecheckt of uren ingediend telt als verschenen, een lege dienst als gemist", () => {
    const t = telOpkomst(
      [
        rij({ timesheet: { status: "APPROVED", actualStart: null } }),
        rij({ timesheet: { status: "DRAFT", actualStart: new Date("2026-11-10T09:02:00+01:00") } }),
        rij({ timesheet: { status: "DRAFT", actualStart: null } }),
      ],
      now,
    );
    expect(t).toMatchObject({ showed: 2, missed: 1, attendancePct: 67, cancellations: 0 });
  });

  it("alleen een afzegging door de werker zelf telt als gemist en als annulering", () => {
    const t = telOpkomst(
      [
        rij({ cancelledAt: voorbij, cancelReason: "Afgezegd door flexwerker: ziek" }),
        rij({ cancelledAt: voorbij, cancelReason: "Geannuleerd door opdrachtgever: regen" }),
        rij({ cancelledAt: voorbij, cancelReason: "Niet opgekomen", endsAt: straks }),
        rij({ timesheet: { status: "PAID", actualStart: null } }),
      ],
      now,
    );
    // de toekomstige no-show telt wel als annulering, maar nog niet in de opkomst van afgelopen diensten
    expect(t).toMatchObject({ showed: 1, missed: 1, attendancePct: 50, cancellations: 2 });
  });
});
