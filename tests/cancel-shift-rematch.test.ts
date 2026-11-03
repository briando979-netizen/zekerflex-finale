import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Zegt een werker af, dan gaat de plek weer open. Tot nu toe wachtte de nieuwe
// matching op de autopilot (twee keer per dag) en hoorde de opdrachtgever niets.
// Nu: meteen opnieuw matchen, de opdrachtgever een pushbericht, en de tijd in de
// mail aan het team in Nederlandse tijd (de server draait in UTC).

const h = vi.hoisted(() => ({
  tasks: [] as Promise<unknown>[],
  pushes: [] as { ids: string[]; push: { title: string; body: string } }[],
  mails: [] as { text: string }[],
  rematched: [] as string[],
  standby: [] as string[],
}));
vi.mock("@/lib/matching/standby", () => ({ notifyStandby: async (id: string) => void h.standby.push(id) }));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "u1", fullName: "Sanne de Vries" }) }));
vi.mock("@/lib/run-after", () => ({ runAfter: (t: () => Promise<unknown>) => void h.tasks.push(t()) }));
vi.mock("@/lib/matching/engine", () => ({ runMatchingForShift: async (id: string) => void h.rematched.push(id) }));
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (ids: string[], push: { title: string; body: string }) => (h.pushes.push({ ids, push }), 1),
}));
vi.mock("@/lib/mail", () => ({ sendMail: async (m: { text: string }) => void h.mails.push(m) }));
vi.mock("@/lib/replacements/store", () => ({ getOpenRequestForShift: async () => null, cancelReplacementRequest: async () => undefined }));
vi.mock("@/lib/messaging/contacts", () => ({ resolveShiftContact: async () => ({ userId: "mgr1", name: "Manager", branch: "Hal 1", shiftTitle: "Magazijn" }) }));
vi.mock("@/lib/claims/store", () => ({ offerEmployerClaim: async () => undefined }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    shiftAssignment: { update: async () => ({}), count: async () => 0 },
    timesheet: { delete: async () => ({}) },
    shift: { update: async () => ({}) },
    freelancerProfile: { findUnique: async () => ({ reliabilityScore: 0.9 }), update: async () => ({}) },
  };
  return {
    prisma: {
      freelancerProfile: { findUnique: async () => ({ id: "fp1" }) },
      shiftAssignment: {
        findFirst: async () => ({
          id: "a1",
          cancelledAt: null,
          shift: {
            id: "sh1",
            title: "Magazijn",
            // over 3 dagen, 09:00 Nederlandse tijd in de winter = 08:00 UTC
            startsAt: new Date("2026-11-20T08:00:00Z"),
            endsAt: new Date("2026-11-20T16:00:00Z"),
            breakMinutes: 30,
            hourlyRateCents: 1800,
            positions: 1,
            status: "FILLED",
            branch: { name: "Hal 1", tenantId: "t1" },
          },
          timesheet: { id: "ts1", status: "DRAFT" },
        }),
      },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { POST } from "@/app/api/me/assignments/[assignmentId]/cancel/route";

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC"; // zoals de server
});
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
  h.tasks.length = 0;
  h.pushes.length = 0;
  h.mails.length = 0;
  h.rematched.length = 0;
  h.standby.length = 0;
});

describe("afzeggen door een werker", () => {
  it("matcht meteen opnieuw, laat de opdrachtgever het weten en noemt de Nederlandse tijd", async () => {
    const res = await POST(new Request("http://x/api", { method: "POST", body: JSON.stringify({ reason: "Ziek geworden" }) }), {
      params: Promise.resolve({ assignmentId: "a1" }),
    });
    await Promise.all(h.tasks);
    vi.useRealTimers();

    expect(res.status).toBe(200);
    expect(h.rematched).toEqual(["sh1"]);
    expect(h.standby).toEqual(["sh1"]); // spoed? dan horen standby-werkers het meteen
    expect(h.pushes).toHaveLength(1);
    expect(h.pushes[0]?.ids).toEqual(["mgr1"]);
    expect(h.pushes[0]?.push.title).toBe("Afgezegd: Magazijn");
    expect(h.pushes[0]?.push.body).toContain("Sanne de Vries komt niet op");
    expect(h.pushes[0]?.push.body).toContain("09:00");
    expect(h.mails[0]?.text).toContain("09:00");
  });
});
