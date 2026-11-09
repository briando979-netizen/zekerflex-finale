import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Kiest een werker een vervanger, dan:
// - weigert het als de vervanger op dat moment al elders werkt (zonder te zeggen waar),
// - krijgt de vervanger een push ("Jij neemt de klus over") en de opdrachtgever
//   één met wie er nu komt. Daarvoor ging alleen een mail naar het team.

const NL_ZZP = { id: "fp-sub", kvkValid: true, vatValid: true, country: "NL", isBlacklisted: false, matchingBlockedUntil: null, user: { kycStatus: "VERIFIED", fullName: "Sanne de Vries" } };

const h = vi.hoisted(() => ({
  overlap: null as unknown,
  profiel: null as unknown,
  viaUitzendbureau: false,
  werkvorm: "zzp" as string,
  pushes: [] as { ids: string[]; push: { title: string; body: string } }[],
  tasks: [] as Promise<unknown>[],
  werkrechtFout: null as string | null,
}));

vi.mock("@/lib/werkrecht/store", () => ({
  eisWerkrecht: async () => {
    if (!h.werkrechtFout) return;
    const { AppError } = await import("@/lib/errors");
    throw AppError.precondition(h.werkrechtFout);
  },
}));

const REQ = {
  id: "r1",
  userId: "u-orig",
  status: "open",
  freelancerName: "Piet",
  branch: "Hal 1",
  shiftId: "sh1",
  assignmentId: "a-orig",
  startsAt: "2026-11-05T08:00:00.000Z",
  responses: [{ userId: "u-sub", name: "Sanne" }],
};

vi.mock("@/lib/replacements/store", () => ({ getReplacementRequest: async () => REQ, markReplacementResolved: async () => undefined }));
vi.mock("@/lib/agreements/model-agreement", () => ({ ensureModelAgreement: async () => ({}) }));
vi.mock("@/lib/mail", () => ({ sendMail: async () => undefined }));
vi.mock("@/lib/webhooks/dispatcher", () => ({ dispatchWebhook: async () => undefined }));
vi.mock("@/lib/messaging/contacts", () => ({ resolveShiftContact: async () => ({ userId: "mgr1" }) }));
vi.mock("@/lib/run-after", () => ({ runAfter: (t: () => Promise<unknown>) => void h.tasks.push(t()) }));
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (ids: string[], push: { title: string; body: string }) => (h.pushes.push({ ids, push }), 1),
}));
vi.mock("@/lib/fiscal/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fiscal/store")>();
  return { ...actual, getFiscal: async () => ({ workerKind: h.werkvorm }) };
});
vi.mock("@/lib/prisma", () => {
  const tx = {
    $executeRaw: async () => 1,
    shiftAssignment: {
      findUnique: async (args: { where: { id?: string } }) =>
        args.where.id
          ? {
              id: "a-orig",
              freelancerId: "fp-orig",
              cancelledAt: null,
              shift: {
                id: "sh1",
                title: "Magazijn",
                startsAt: new Date("2026-11-05T08:00:00Z"),
                endsAt: new Date("2026-11-05T16:00:00Z"),
                breakMinutes: 30,
                hourlyRateCents: 1800,
                branchId: "b1",
                branch: { tenantId: "t1" },
              },
              timesheet: null,
              modelAgreement: null,
            }
          : null,
      findFirst: async () => h.overlap,
      update: async () => ({}),
      create: async () => ({ id: "a-sub" }),
      count: async () => 1,
    },
    timesheet: { upsert: async () => ({}), delete: async () => ({}) },
    shiftMatch: { updateMany: async () => ({ count: 0 }) },
    shift: { findUniqueOrThrow: async () => ({ positions: 1, status: "FILLED" }), update: async () => ({}) },
  };
  return {
    prisma: {
      freelancerProfile: {
        findUnique: async () => h.profiel,
      },
      shift: { findUnique: async () => ({ viaUitzendbureau: h.viaUitzendbureau }) },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { reassignAssignment } from "@/lib/replacements/reassign";

beforeEach(() => {
  // de dienst begint op 5 nov 2026; zonder vaste klok is hij na die dag "al begonnen"
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
  h.overlap = null;
  h.profiel = NL_ZZP;
  h.viaUitzendbureau = false;
  h.werkvorm = "zzp";
  h.werkrechtFout = null;
  h.pushes.length = 0;
  h.tasks.length = 0;
});

afterEach(() => vi.useRealTimers());

describe("reassignAssignment", () => {
  it("laat de vervanger en de opdrachtgever het meteen weten", async () => {
    await reassignAssignment({ requestId: "r1", substituteUserId: "u-sub", pickedByUserId: "u-orig" });
    await Promise.all(h.tasks);
    expect(h.pushes.map((p) => p.ids[0])).toEqual(["u-sub", "mgr1"]);
    expect(h.pushes[0]?.push.title).toBe("Jij neemt de klus over: Magazijn");
    expect(h.pushes[0]?.push.body).toContain("do 5 nov 09:00–17:00 bij Hal 1");
    expect(h.pushes[1]?.push.body).toBe("Sanne de Vries komt in plaats van Piet (do 5 nov 09:00–17:00).");
  });

  it("weigert een vervanger die op dat moment al elders werkt, zonder te zeggen waar", async () => {
    h.overlap = { shift: { id: "x", title: "Elders", startsAt: new Date("2026-11-05T09:00:00Z"), endsAt: new Date("2026-11-05T12:00:00Z"), branch: { name: "Concurrent BV" } } };
    const err = await reassignAssignment({ requestId: "r1", substituteUserId: "u-sub", pickedByUserId: "u-orig" }).catch((e: unknown) => e as Error);
    expect((err as Error).message).toContain("al ingepland bij een andere dienst");
    expect((err as Error).message).not.toContain("Concurrent BV");
    expect(h.pushes).toHaveLength(0);
  });
});
// Overnemen volgt dezelfde regel als de matching (lib/matching/geschikt.ts):
// een uitzendklus alleen voor een uitzendkracht, een gewone klus voor een zzp'er
// met een geldige inschrijving of een uitzendkracht.
describe("reassignAssignment: wie mag de klus overnemen", () => {
  const UITZENDKRACHT = { ...NL_ZZP, kvkValid: false, vatValid: false };
  const kies = () => reassignAssignment({ requestId: "r1", substituteUserId: "u-sub", pickedByUserId: "u-orig" });

  it("een uitzendkracht mag een uitzendklus overnemen", async () => {
    h.profiel = UITZENDKRACHT;
    h.werkvorm = "uitzendkracht";
    h.viaUitzendbureau = true;
    await expect(kies()).resolves.toMatchObject({ newAssignmentId: "a-sub" });
  });

  it("een uitzendkracht mag ook een gewone klus overnemen (zoals in de matching)", async () => {
    h.profiel = UITZENDKRACHT;
    h.werkvorm = "uitzendkracht";
    await expect(kies()).resolves.toMatchObject({ newAssignmentId: "a-sub" });
  });

  it("een zzp'er mag geen uitzendklus overnemen", async () => {
    h.viaUitzendbureau = true;
    const err = await kies().catch((e: unknown) => e as Error);
    expect((err as Error).message).toBe("Deze klus loopt via het uitzendbureau: alleen een uitzendkracht kan hem overnemen.");
  });

  it("een Nederlandse zzp'er zonder KVK mag niet overnemen, ook niet met een btw-nummer", async () => {
    h.profiel = { ...NL_ZZP, kvkValid: false };
    const err = await kies().catch((e: unknown) => e as Error);
    expect((err as Error).message).toBe("Deze kandidaat is niet volledig geverifieerd.");
  });

  it("zonder recht om te werken in Nederland: niet overnemen, zonder pushes (lib/werkrecht)", async () => {
    h.werkrechtFout = "Deze kandidaat heeft het recht om in Nederland te werken nog niet aangetoond.";
    const err = await kies().catch((e: unknown) => e as Error);
    expect((err as Error).message).toContain("recht om in Nederland te werken");
    expect(h.pushes).toHaveLength(0);
  });

  it("een zzp'er uit het buitenland met een geldig EU-btw-nummer mag een gewone klus overnemen", async () => {
    h.profiel = { ...NL_ZZP, kvkValid: false, country: "PL" };
    await expect(kies()).resolves.toMatchObject({ newAssignmentId: "a-sub" });
  });
});
