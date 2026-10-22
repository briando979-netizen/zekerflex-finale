import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  shiftAssignment: { findMany: vi.fn(async () => [] as unknown[]) },
  timesheet: { findMany: vi.fn(async () => [] as unknown[]), count: vi.fn(async () => 0) },
  shift: { findMany: vi.fn(async () => [] as unknown[]), count: vi.fn(async () => 0) },
  membership: { findMany: vi.fn(async () => [{ userId: "boss" }]) },
  user: { count: vi.fn(async () => 0) },
  payment: { count: vi.fn(async () => 0) },
}));
const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = v),
  kvAppend: async (k: string, v: unknown) => void (kv[k] = [...((kv[k] as unknown[]) ?? []), v]),
}));
vi.mock("@/lib/redis", () => ({ acquireLock: async () => async () => undefined }));
const sendUserPush = vi.fn(async () => 1);
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => sendUserPush(...(a as [])) }));
vi.mock("@/lib/ai/client", () => ({
  ensureAiNode: async () => undefined, chat: vi.fn(), llmConfigProblem: () => "geen model" }));
vi.mock("@/lib/rag/cag", () => ({ knowledgePack: () => ({ passages: 10 }) }));
vi.mock("@/lib/matching/engine", () => ({ runMatchingForShift: vi.fn(async () => ({ eligible: 3, notified: 2, autoAssigned: 0 })) }));
const approveTimesheet = vi.fn(async () => ({}));
vi.mock("@/lib/timesheets/approve", () => ({ approveTimesheet: (...a: unknown[]) => approveTimesheet(...(a as [])) }));
const fraudForTimesheet = vi.fn(async () => [] as { severity: string }[]);
vi.mock("@/lib/fraud/timesheet", () => ({ fraudForTimesheet: (...a: unknown[]) => fraudForTimesheet(...(a as [])) }));
const principalForUser = vi.fn();
vi.mock("@/lib/auth", () => ({ principalForUser: (...a: unknown[]) => principalForUser(...a) }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ACTIONS } from "@/lib/autopilot/actions";
import { runAutopilot } from "@/lib/autopilot";
import { saveSettings, setTenantAutopilot } from "@/lib/autopilot/store";
import { modelForPurpose, roleForPurpose } from "@/lib/ai/models";

const action = (k: string) => ACTIONS.find((a) => a.key === k)!;
const NOW = new Date("2026-10-22T10:00:00Z");
const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

afterEach(() => {
  vi.clearAllMocks();
  db.shiftAssignment.findMany.mockResolvedValue([]);
  db.timesheet.findMany.mockResolvedValue([]);
  db.shift.findMany.mockResolvedValue([]);
  fraudForTimesheet.mockResolvedValue([]);
  for (const k of Object.keys(kv)) delete kv[k];
});

describe("uren-invullen", () => {
  it("reminds each worker once per assignment", async () => {
    db.shiftAssignment.findMany.mockResolvedValue([{ id: "a1", freelancer: { userId: "w1" }, shift: { id: "s1", title: "Kassa", startsAt: at(-20), branch: { name: "AH" } } }]);
    expect((await action("uren-invullen").run(NOW)).count).toBe(1);
    expect((await action("uren-invullen").run(NOW)).count).toBe(0);
    expect(sendUserPush).toHaveBeenCalledTimes(1);
  });
});

describe("uren-auto-goedkeuren (consent)", () => {
  const ts = (over: Record<string, unknown> = {}) => ({
    id: "t1",
    scheduledStart: at(-30),
    scheduledEnd: at(-24),
    actualStart: new Date(at(-30).getTime() + 5 * 60_000),
    actualEnd: at(-24),
    breakMinutes: 30,
    billableMinutes: 330,
    ...over,
  });
  const boss = { userId: "boss", grants: [{ role: "HQ_ADMIN", organizationId: "ten1", locationIds: [] }] };

  it("does nothing for organisations that did not opt in", async () => {
    db.timesheet.findMany.mockResolvedValue([ts()]);
    expect((await action("uren-auto-goedkeuren").run(NOW)).count).toBe(0);
    expect(approveTimesheet).not.toHaveBeenCalled();
  });

  it("approves matching, clean hours with the opting-in manager's own rights", async () => {
    await setTenantAutopilot("ten1", { autoApproveHours: true, byUserId: "boss", since: NOW.toISOString() });
    principalForUser.mockResolvedValue(boss);
    db.timesheet.findMany.mockResolvedValue([ts()]);
    expect((await action("uren-auto-goedkeuren").run(NOW)).count).toBe(1);
    expect(approveTimesheet).toHaveBeenCalledWith({ timesheetId: "t1", principal: boss });
  });

  it("leaves deviating, over-billed or flagged hours for a human", async () => {
    await setTenantAutopilot("ten1", { autoApproveHours: true, byUserId: "boss", since: NOW.toISOString() });
    principalForUser.mockResolvedValue(boss);
    db.timesheet.findMany.mockResolvedValue([
      ts({ id: "late", actualEnd: new Date(at(-24).getTime() + 40 * 60_000) }),
      ts({ id: "over", billableMinutes: 999 }),
      ts({ id: "nocheck", actualStart: null }),
      ts({ id: "flag" }),
    ]);
    fraudForTimesheet.mockResolvedValue([{ severity: "warning" }]);
    const r = await action("uren-auto-goedkeuren").run(NOW);
    expect(r.count).toBe(0);
    expect(approveTimesheet).not.toHaveBeenCalled();
  });

  it("stops when the manager lost their rights", async () => {
    await setTenantAutopilot("ten1", { autoApproveHours: true, byUserId: "boss", since: NOW.toISOString() });
    principalForUser.mockResolvedValue({ userId: "boss", grants: [] });
    db.timesheet.findMany.mockResolvedValue([ts()]);
    expect((await action("uren-auto-goedkeuren").run(NOW)).count).toBe(0);
  });
});

describe("runner", () => {
  it("keeps going when one action fails and logs everything", async () => {
    db.shiftAssignment.findMany.mockRejectedValueOnce(new Error("db hik"));
    const rep = await runAutopilot("handmatig");
    expect(rep.ran.find((r) => r.key === "uren-invullen")!.ok).toBe(false);
    expect(rep.ran.filter((r) => r.ok).length).toBe(ACTIONS.length - 1);
    expect((kv["autopilot:log"] as unknown[]).length).toBe(ACTIONS.length);
  });

  it("respects the off switch for cron runs and per-action switches", async () => {
    await saveSettings({ enabled: false, disabled: [] });
    expect((await runAutopilot("cron")).ran).toHaveLength(0);
    await saveSettings({ enabled: true, disabled: ["admin-dagrapport"] });
    const rep = await runAutopilot("cron");
    expect(rep.skipped).toContain("admin-dagrapport");
  });
});

describe("model fleet", () => {
  it("routes purposes to specialised roles, falling back to the main model", () => {
    expect(roleForPurpose("rag-plan")).toBe("reasoning");
    expect(roleForPurpose("ai-team-sales")).toBe("reasoning");
    expect(roleForPurpose("translate")).toBe("translate");
    expect(roleForPurpose("unknown")).toBe("main");
    expect(modelForPurpose("dev-advisor")).toBeTruthy();
  });
});
