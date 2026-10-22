import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ kv: new Map<string, unknown>(), todos: [] as string[] }));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(m.kv.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
}));
vi.mock("@/lib/admin/owner-todos", () => ({ addCustom: async (t: string) => void m.todos.push(t) }));
vi.mock("@/lib/ai/client", () => ({
  ensureAiNode: async () => undefined, chat: vi.fn(), llmConfigProblem: () => "geen model" }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { aggregate: async () => ({ _sum: { totalCents: 123_400 }, _count: 40 }) },
    shift: {
      findMany: async () =>
        Array.from({ length: 10 }, () => ({ title: "Orderpicker magazijn", positions: 2, branch: { city: "Tilburg" }, _count: { assignments: 0 } })),
    },
    user: { count: async () => 12 },
    membership: { count: async () => 9 },
    tenant: { count: async () => 1 },
    shiftAssignment: { count: async () => 3 },
  },
}));

import { commitInvestment, getBudget, investeren, setMonthlyBudget } from "@/lib/ai-teams/invest";

const out = { logs: [] as string[], props: [] as { title: string; action: { type: string; budgetCents: number } }[] };
const tools = {
  log: async (_t: string, text: string) => void out.logs.push(text),
  propose: async (p: (typeof out.props)[number]) => void out.props.push(p),
};

beforeEach(() => {
  m.kv.clear();
  m.todos = [];
  out.logs = [];
  out.props = [];
});

describe("investeringsteam", () => {
  it("makes no proposals without a budget", async () => {
    await investeren(new Date(), tools as never);
    expect(out.props).toHaveLength(0);
    expect(out.logs.join(" ")).toContain("nog geen investeringsbudget");
  });

  it("proposes only what fits the remaining budget, based on real gaps", async () => {
    await setMonthlyBudget(20_000); // € 200
    await investeren(new Date(), tools as never);
    expect(out.props.length).toBeGreaterThan(0);
    expect(out.props.every((p) => p.action.type === "investment" && p.action.budgetCents <= 20_000)).toBe(true);
    // the € 250 recruitment idea for the logistics gap doesn't fit € 200
    expect(out.props.some((p) => /werven/.test(p.title))).toBe(false);
  });

  it("an approved investment becomes a task and is booked against the budget — never paid out", async () => {
    await setMonthlyBudget(30_000);
    const r1 = await commitInvestment("Indeed-sponsoring", 15_000, "zet € 5 per dag aan");
    expect(r1).toContain("staat op je takenlijst");
    expect(m.todos[0]).toContain("Indeed-sponsoring");
    expect((await getBudget()).committedCents).toBe(15_000);
    const r2 = await commitInvestment("Te groot", 20_000, "x");
    expect(r2).toContain("past niet meer");
    expect(m.todos).toHaveLength(1);
  });
});
