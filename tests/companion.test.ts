import { beforeEach, describe, expect, it, vi } from "vitest";

// Laptop-Jarvis: personal token auth, and nothing is executed without a spoken "ja".

const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  admin: true,
  props: [] as { id: string; title: string; detail: string; status: string; action: unknown }[],
  exec: vi.fn(async () => "3 extra flexkracht(en) benaderd"),
  setStatus: vi.fn(),
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(m.kv.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: { findFirst: async () => (m.admin ? { id: "m1" } : null) },
    shift: { count: async () => 21 },
    user: { count: async () => 1 },
    timesheet: { count: async () => 0 },
  },
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/ai-teams", () => ({ feed: async () => [], proposals: async () => m.props, setProposalStatus: m.setStatus }));
vi.mock("@/lib/ai-teams/execute", () => ({ executeProposal: m.exec }));
vi.mock("@/lib/admin/owner-todos", () => ({ ownerTodos: async () => [] }));
vi.mock("@/lib/ops/alert", () => ({ recentAlerts: async () => [] }));
vi.mock("@/lib/analytics/live", () => ({ liveSnapshot: async () => ({ active: [], today: { visitors: 0, who: {} } }) }));
vi.mock("@/lib/ai/client", () => ({ chat: vi.fn(), llmConfigProblem: () => "geen model" }));
vi.mock("@/lib/jarvis/persona", () => ({ JARVIS_PERSONA: "" }));

import { answer, createCompanionToken, revokeCompanionToken, verifyCompanion } from "@/lib/companion";

const req = (token?: string) => new Request("https://zf.test/api/companion/ask", { headers: token ? { authorization: `Bearer ${token}` } : {} });
const owner = { userId: "admin1", email: "admin@zf.nl" };

beforeEach(() => {
  m.kv.clear();
  m.admin = true;
  m.exec.mockClear();
  m.props = [{ id: "p1", title: "Klus X begint over 10 uur", detail: "Opnieuw uitzetten?", status: "open", action: { type: "rematch-shift", shiftId: "s1" } }];
});

describe("companion token", () => {
  it("only a valid, current token of an active platform admin works", async () => {
    const t = await createCompanionToken("admin1", "admin@zf.nl");
    expect(t.startsWith("zfj_")).toBe(true);
    expect(await verifyCompanion(req(t))).toEqual(owner);
    expect(await verifyCompanion(req("zfj_wrong"))).toBeNull();
    expect(await verifyCompanion(req())).toBeNull();
    m.admin = false;
    expect(await verifyCompanion(req(t))).toBeNull();
    m.admin = true;
    const t2 = await createCompanionToken("admin1", "admin@zf.nl"); // replaces the old one
    expect(await verifyCompanion(req(t))).toBeNull();
    await revokeCompanionToken("admin1");
    expect(await verifyCompanion(req(t2))).toBeNull();
  });
});

describe("companion answers", () => {
  it("briefing works without a language model", async () => {
    expect((await answer("Jarvis, geef de briefing", owner)).text).toContain("Er staan 21 klussen open");
  });

  it("executes a proposal only after an explicit 'ja'", async () => {
    await answer("welke voorstellen staan er", owner);
    const ask = await answer("voer voorstel 1 uit", owner);
    expect(ask.awaitingConfirm).toBe(true);
    expect(m.exec).not.toHaveBeenCalled();
    const done = await answer("ja", owner);
    expect(m.exec).toHaveBeenCalledWith({ type: "rematch-shift", shiftId: "s1" }, "admin@zf.nl");
    expect(done.text).toContain("Uitgevoerd");
  });

  it("'nee' (or anything else) cancels", async () => {
    await answer("welke voorstellen staan er", owner);
    await answer("voer voorstel 1 uit", owner);
    expect((await answer("nee", owner)).text).toContain("niets");
    expect(m.exec).not.toHaveBeenCalled();
    // a later 'ja' without a fresh request does nothing
    await answer("ja", owner);
    expect(m.exec).not.toHaveBeenCalled();
  });
});
