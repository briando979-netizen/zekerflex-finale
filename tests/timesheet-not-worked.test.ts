import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
const m = vi.hoisted(() => ({ ts: null as Record<string, unknown> | null, sendMail: vi.fn(), audit: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => ({ userId: "u1", fullName: "Liam Gold", grants: [] }),
  requireRole: () => undefined,
}));
vi.mock("@/lib/prisma", () => ({ prisma: { timesheet: { findFirst: async () => m.ts } } }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: async (k: string) => kv.get(k) ?? null, kvSet: async (k: string, v: unknown) => void kv.set(k, v) }));
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => m.sendMail(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => m.audit(...a) }));
vi.mock("@/lib/env", () => ({ env: { MAIL_ADMIN: "ops@zekerflex.test" } }));

import { POST } from "@/app/api/timesheets/[timesheetId]/not-worked/route";

const call = (body: unknown) =>
  POST(new Request("http://x/api/timesheets/t1/not-worked", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ timesheetId: "t1" }) });

beforeEach(() => {
  kv.clear();
  m.ts = { id: "t1", status: "DRAFT", scheduledStart: new Date("2026-10-18T08:00:00Z"), branch: { name: "Utrecht", tenant: { name: "Bakkerij" } } };
  m.sendMail.mockReset().mockResolvedValue({});
  m.audit.mockReset();
});

describe("niet gewerkt melden", () => {
  it("records it once and tells ZekerFlex, without touching pay", async () => {
    expect((await call({ reason: "client_cancelled", note: "Dicht vanwege storing" })).status).toBe(200);
    expect(m.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "ops@zekerflex.test", text: expect.stringContaining("afgezegd") }));
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "timesheet.not_worked" }));
    const again = await (await call({ reason: "client_cancelled" })).json();
    expect(again.duplicate).toBe(true);
    expect(m.sendMail).toHaveBeenCalledTimes(1);
  });

  it("refuses once the hours were submitted, and unknown reasons", async () => {
    m.ts = { ...m.ts!, status: "SUBMITTED" };
    expect((await call({ reason: "sick" })).status).toBe(412);
    expect((await call({ reason: "verzonnen" })).status).toBe(422);
  });
});
