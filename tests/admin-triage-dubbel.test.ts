import { describe, expect, it, vi } from "vitest";

// Het controlecentrum meldt werkers die dubbel staan ingepland (geboekt vóór de
// controle in lib/shifts/worker-overlap.ts). Deze test loopt door getTriage zelf,
// zodat een verkeerde volgorde in de Promise.all-destructuring opvalt.

const h = vi.hoisted(() => {
  const HOUR = 3_600_000;
  const none = async () => [];
  function booking(freelancerId: string, shiftId: string, title: string, branch: string, fromH: number, toH: number) {
    return {
      freelancerId,
      shiftId,
      freelancer: { user: { fullName: freelancerId === "w1" ? "Sanne de Vries" : "Piet Jansen" } },
      shift: { title, startsAt: new Date(Date.now() + fromH * HOUR), endsAt: new Date(Date.now() + toH * HOUR), branch: { name: branch } },
    };
  }
  return { none, booking };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dispute: { findMany: h.none },
    timesheet: { findMany: h.none },
    payment: { findMany: h.none },
    dbaComplianceRecord: { findMany: h.none },
    user: { findMany: h.none },
    shift: { findMany: h.none },
    shiftAssignment: {
      findMany: async () => [
        h.booking("w1", "s1", "Bediening", "Café Noord", 30, 38),
        h.booking("w1", "s2", "Afwas", "Hotel Zuid", 34, 40),
        h.booking("w2", "s3", "Bediening", "Café Noord", 30, 38),
      ],
    },
  },
}));
vi.mock("@/lib/replacements/store", () => ({ listReplacementRequests: async () => [] }));
vi.mock("@/lib/claims/store", () => ({ claimsInIncasso: async () => [] }));

import { getTriage } from "@/lib/admin/triage";

describe("getTriage — dubbel ingepland", () => {
  it("meldt alleen de werker met twee overlappende diensten, als urgent binnen twee dagen", async () => {
    const items = (await getTriage()).filter((i) => i.kind === "Dubbel");
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Dubbel ingepland — Sanne de Vries");
    expect(items[0]?.detail).toContain("Bediening · Café Noord en Afwas · Hotel Zuid");
    expect(items[0]?.severity).toBe("high");
  });
});
