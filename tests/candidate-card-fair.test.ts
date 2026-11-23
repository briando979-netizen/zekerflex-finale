import { describe, expect, it, vi } from "vitest";

const shift = (endsAt: string) => ({
  title: "Bediening",
  startsAt: new Date(endsAt),
  endsAt: new Date(endsAt),
  breakMinutes: 0,
  hourlyRateCents: 1600,
  requiredSkill: null,
  branch: { name: "Café", city: "Utrecht", tenantId: "t1", latitude: 52.09, longitude: 5.12, tenant: { name: "Café B.V." } },
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async () => ({
        fullName: "Sanne",
        freelancerProfile: { id: "fp1", badgeLevel: "GOLD", reliabilityScore: 0.9, shiftsCompleted: 3, homePostalCode: "1012 JS", skills: [] },
      }),
    },
    shiftAssignment: {
      findMany: async () => [
        // gewerkt
        { shiftId: "s1", cancelledAt: null, cancelReason: null, timesheet: { status: "PAID", actualStart: null, billableMinutes: 480 }, shift: shift("2026-10-01T16:00:00Z") },
        { shiftId: "s2", cancelledAt: null, cancelReason: null, timesheet: { status: "APPROVED", actualStart: new Date(), billableMinutes: 480 }, shift: shift("2026-10-02T16:00:00Z") },
        // niet de schuld van de werker
        { shiftId: "s3", cancelledAt: new Date(), cancelReason: "Geannuleerd door opdrachtgever: regen", timesheet: null, shift: shift("2026-10-03T16:00:00Z") },
        { shiftId: "s4", cancelledAt: new Date(), cancelReason: "Vervangen via ZekerFlex (vrije vervanging)", timesheet: null, shift: shift("2026-10-04T16:00:00Z") },
        // wel de werker
        { shiftId: "s5", cancelledAt: new Date(), cancelReason: "Afgezegd door flexwerker (buiten de opzegtermijn): ziek", timesheet: null, shift: shift("2026-10-05T16:00:00Z") },
      ],
    },
  },
}));
vi.mock("@/lib/reviews/store", () => ({
  reviewSummary: async () => ({ average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, recent: [] }),
  listReviews: async () => [],
}));
vi.mock("@/lib/certificates/store", () => ({ listCertificates: async () => [], CERT_TYPES: {} }));
vi.mock("@/lib/profile/store", () => ({ getUserAvatars: async () => ({}) }));
vi.mock("@/lib/werker/ervaring-store", () => ({ getErvaring: async () => ({ items: [], geen: false }) }));
vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: async () => ({ tenants: {}, users: {} }) }));

import { buildCandidateCard } from "@/lib/employer/candidate-card";

describe("buildCandidateCard", () => {
  it("rekent annuleringen door de opdrachtgever en vervangingen niet tegen de werker", async () => {
    const card = await buildCandidateCard("u1", new Date("2026-11-03T10:00:00Z"));
    expect(card!.cancellations).toBe(1);
    // 2 gekomen, 1 zelf afgezegd → 67%
    expect(card!.attendancePct).toBe(67);
  });

  it("telt de drie cijfers over 6 maanden: een vervanging is geen gemiste klus, een annulering door het bedrijf telt niet mee", async () => {
    const card = await buildCandidateCard("u1", new Date("2026-11-03T10:00:00Z"));
    expect(card!.prestaties).toMatchObject({ gematcht: 4, nietVoltooid: 1, vervanging: 1, zelf: 2, compleetPct: 75, zelfPct: 50 });
    expect(card!.gewerktBij).toEqual(["Café B.V."]);
  });
});
