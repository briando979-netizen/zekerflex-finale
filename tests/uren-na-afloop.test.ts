import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Inchecken is een eigen pagina; uren indienen pas na afloop van de klus (lib/timesheets/indienen.ts).
// Vaste klok en datums met een zone: deze test hangt niet af van het moment van draaien.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
}));
const pushes: { userIds: string[]; title: string; url: string | undefined }[] = [];
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (userIds: string[], p: { title: string; data?: { url?: string } }) => {
    pushes.push({ userIds, title: p.title, url: p.data?.url });
    return 1;
  },
}));

const update = vi.fn(async (..._a: unknown[]) => ({ id: "ts-1", status: "SUBMITTED", billableMinutes: 450 }));
let timesheet: Record<string, unknown> | null = null;
let assignments: unknown[] = [];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => ({ id: "fp-1" }) },
    timesheet: { findFirst: async () => timesheet, update: (...a: unknown[]) => update(...a) },
    shiftAssignment: {
      findMany: async (args: { where: { acceptedAt?: { gte: Date } } }) => (args.where.acceptedAt ? [] : assignments),
    },
    user: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => ({ userId: "u-1", fullName: "Test Werker" }),
  requireRole: () => undefined,
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/notifications/employer-push", () => ({ pushHoursSubmitted: async () => undefined }));
vi.mock("@/lib/run-after", () => ({ runAfter: () => undefined }));

const { urenIndienenOpen } = await import("@/lib/timesheets/indienen");
const { POST } = await import("@/app/api/timesheets/[timesheetId]/submit/route");
const { sweepWorkerPushes } = await import("@/lib/notifications/worker-push");

const START = new Date("2026-11-12T09:00:00+01:00");
const EIND = new Date("2026-11-12T17:00:00+01:00");

function indienen() {
  const req = new Request("http://app:3000/api/timesheets/ts-1/submit", { method: "POST", body: JSON.stringify({ breakMinutes: 30 }) });
  return POST(req, { params: Promise.resolve({ timesheetId: "ts-1" }) });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  update.mockClear();
  kv.clear();
  pushes.length = 0;
  timesheet = { id: "ts-1", status: "DRAFT", scheduledStart: START, scheduledEnd: EIND, actualStart: null, actualEnd: null, breakMinutes: 30, assignment: { shiftId: "s-1" } };
});
afterEach(() => {
  vi.useRealTimers();
});

describe("wanneer uren indienen open is", () => {
  it("pas na de eindtijd, of eerder na het uitchecken", () => {
    expect(urenIndienenOpen({ scheduledEnd: EIND, actualEnd: null }, new Date("2026-11-12T12:00:00+01:00").getTime())).toBe(false);
    expect(urenIndienenOpen({ scheduledEnd: EIND, actualEnd: null }, EIND.getTime())).toBe(true);
    expect(urenIndienenOpen({ scheduledEnd: EIND, actualEnd: new Date("2026-11-12T14:00:00+01:00") }, new Date("2026-11-12T14:05:00+01:00").getTime())).toBe(true);
  });
});

describe("POST /api/timesheets/:id/submit", () => {
  it("weigert tijdens de klus en slaat niets op", async () => {
    vi.setSystemTime(new Date("2026-11-12T12:00:00+01:00"));
    const res = await indienen();
    expect(res.status).toBe(412);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/na de eindtijd/);
    expect(update).not.toHaveBeenCalled();
  });

  it("neemt de uren aan na de eindtijd", async () => {
    vi.setSystemTime(new Date("2026-11-12T17:30:00+01:00"));
    const res = await indienen();
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("neemt de uren aan na vroeg uitchecken", async () => {
    vi.setSystemTime(new Date("2026-11-12T14:10:00+01:00"));
    timesheet = { ...timesheet, actualStart: START, actualEnd: new Date("2026-11-12T14:00:00+01:00") };
    const res = await indienen();
    expect(res.status).toBe(200);
  });
});

describe("melding bij de start", () => {
  it("opent de incheckpagina; zonder urenbriefje de klus", async () => {
    const nu = new Date("2026-11-12T09:10:00+01:00");
    const rij = (id: string, ts: { id: string } | null) => ({
      id,
      acceptedAt: new Date(nu.getTime() - 3 * 24 * 3_600_000),
      freelancer: { userId: `u-${id}` },
      shift: { id: `s-${id}`, title: "Bediening", startsAt: new Date(nu.getTime() - 10 * 60_000), branch: { name: "Grand Café", tenant: { name: "Grand Café BV" } } },
      timesheet: ts,
    });
    assignments = [rij("a", { id: "ts-a" }), rij("b", null)];
    await sweepWorkerPushes(nu);
    expect(pushes.find((p) => p.userIds[0] === "u-a")?.url).toBe("/dashboard/inchecken/ts-a");
    expect(pushes.find((p) => p.userIds[0] === "u-b")?.url).toBe("/dashboard/klussen/s-b");
  });
});
