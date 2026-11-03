import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/auth";

// Een werkgever verzet de tijd van een dienst waar al iemand op staat:
// - niet als die kracht op het nieuwe tijdstip al elders werkt (zonder te zeggen waar),
// - de concept-urenbriefjes volgen de nieuwe tijden (anders telden oude uren),
// - het chatbericht noemt de nieuwe tijd.

const h = vi.hoisted(() => ({
  overlap: null as unknown,
  tsUpdates: [] as unknown[],
  messages: [] as string[],
}));

const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requirePrincipal: () => requirePrincipal() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["org1"], branchIds: null }) }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/messaging/store", () => ({
  ensureDirectThread: async () => ({ id: "thread1" }),
  postMessage: async (_t: string, _a: string, text: string) => void h.messages.push(text),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      findFirst: async () => ({
        id: "sh1",
        title: "Magazijn",
        description: null,
        status: "PARTIALLY_FILLED",
        visibility: "PUBLIC",
        startsAt: new Date("2026-11-05T08:00:00Z"),
        endsAt: new Date("2026-11-05T16:00:00Z"),
        breakMinutes: 30,
        hourlyRateCents: 1800,
        positions: 2,
        viaUitzendbureau: false,
        branch: { name: "Hal 1" },
        assignments: [{ id: "a1", freelancer: { id: "fp1", userId: "w1", user: { fullName: "Sanne" } } }],
      }),
      update: (args: unknown) => args,
    },
    timesheet: { updateMany: (args: unknown) => (h.tsUpdates.push(args), args) },
    shiftAssignment: { findFirst: async () => h.overlap },
    $transaction: async (ops: unknown[]) => ops,
  },
}));

import { updateShiftAction } from "@/app/werkgever/diensten/[shiftId]/actions";

const manager = {
  userId: "mgr1",
  email: "manager@example.com",
  fullName: "Manager",
  emailVerifiedAt: new Date(),
  grants: [{ role: "LOCAL_MANAGER", organizationId: "org1", locationIds: ["branch1"] }],
  memberships: [],
  managedBranchIds: ["branch1"],
} as unknown as Principal;

beforeEach(() => {
  requirePrincipal.mockResolvedValue(manager);
  h.overlap = null;
  h.tsUpdates.length = 0;
  h.messages.length = 0;
});

describe("updateShiftAction — tijd verzetten met ingeplande krachten", () => {
  it("weigert als een ingeplande kracht op het nieuwe tijdstip al elders werkt", async () => {
    h.overlap = { shift: { id: "x", title: "Elders", startsAt: new Date(), endsAt: new Date(), branch: { name: "Concurrent BV" } } };
    const r = await updateShiftAction("sh1", { startsAt: "2026-11-05T10:00:00.000Z", endsAt: "2026-11-05T18:00:00.000Z" });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("een van je ingeplande krachten al elders");
    expect(r.message).not.toContain("Concurrent BV");
    expect(h.tsUpdates).toHaveLength(0);
  });

  it("zet de concept-urenbriefjes op de nieuwe tijden en noemt de nieuwe tijd in de chat", async () => {
    const r = await updateShiftAction("sh1", { startsAt: "2026-11-05T09:00:00.000Z", endsAt: "2026-11-05T17:00:00.000Z" });
    expect(r.ok).toBe(true);
    expect(h.tsUpdates[0]).toEqual({
      where: { assignmentId: { in: ["a1"] }, status: "DRAFT" },
      data: { scheduledStart: new Date("2026-11-05T09:00:00.000Z"), scheduledEnd: new Date("2026-11-05T17:00:00.000Z") },
    });
    expect(h.messages[0]).toBe("De opdrachtgever heeft de tijd van deze dienst aangepast: nu do 5 nov 10:00–18:00. Bekijk de klus opnieuw.");
  });

  it("laat de urenbriefjes met rust als alleen de titel verandert", async () => {
    const r = await updateShiftAction("sh1", { title: "Magazijn (hal 2)" });
    expect(r.ok).toBe(true);
    expect(h.tsUpdates).toHaveLength(0);
    expect(h.messages[0]).toContain("details van deze dienst aangepast");
  });
});
