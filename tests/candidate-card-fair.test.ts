import { describe, expect, it, vi } from "vitest";

const shift = (endsAt: string) => ({ title: "Bediening", startsAt: new Date(endsAt), endsAt: new Date(endsAt), hourlyRateCents: 1600, branch: { name: "Café", city: "Utrecht" } });

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
        { cancelledAt: null, cancelReason: null, timesheet: { status: "PAID", actualStart: null }, shift: shift("2026-10-01T16:00:00Z") },
        { cancelledAt: null, cancelReason: null, timesheet: { status: "APPROVED", actualStart: new Date() }, shift: shift("2026-10-02T16:00:00Z") },
        // niet de schuld van de werker
        { cancelledAt: new Date(), cancelReason: "Geannuleerd door opdrachtgever: regen", timesheet: null, shift: shift("2026-10-03T16:00:00Z") },
        { cancelledAt: new Date(), cancelReason: "Vervangen via ZekerFlex (vrije vervanging)", timesheet: null, shift: shift("2026-10-04T16:00:00Z") },
        // wel de werker
        { cancelledAt: new Date(), cancelReason: "Afgezegd door flexwerker (buiten de opzegtermijn): ziek", timesheet: null, shift: shift("2026-10-05T16:00:00Z") },
      ],
    },
  },
}));
vi.mock("@/lib/reviews/store", () => ({ reviewSummary: async () => ({ average: 0, count: 0, recent: [] }) }));
vi.mock("@/lib/certificates/store", () => ({ listCertificates: async () => [], CERT_TYPES: {} }));
vi.mock("@/lib/profile/store", () => ({ getUserAvatars: async () => ({}) }));

import { buildCandidateCard } from "@/lib/employer/candidate-card";

describe("buildCandidateCard", () => {
  it("rekent annuleringen door de opdrachtgever en vervangingen niet tegen de werker", async () => {
    const card = await buildCandidateCard("u1", new Date("2026-11-03T10:00:00Z"));
    expect(card!.cancellations).toBe(1);
    // 2 gekomen, 1 zelf afgezegd → 67%
    expect(card!.attendancePct).toBe(67);
  });
});
