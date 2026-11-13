import { beforeEach, describe, expect, it, vi } from "vitest";

// Db-groei-ronde (13 nov 2026): de AI-gebruikslog (AiUsageLog) groeide zonder grens (36 → 627 → 6.449 rijen per maand).
// Na 90 dagen gaat een rij weg, begrensd per keer en de oudste eerst; droog telt alleen. Geen persoonsgegevens, dus buiten
// lib/privacy. Een storing in het opruimen houdt de AI-watchdog niet tegen.

const NU = new Date("2026-11-13T07:00:00Z");
const DAG = 86_400_000;

const h = vi.hoisted(() => ({
  rijen: [] as { id: string; createdAt: Date }[],
  verwijderd: [] as string[],
  fout: null as Error | null,
  runs: [] as boolean[],
}));

// binnen de mock pas bij een aanroep gebruikt (vi.mock wordt naar boven gehesen)
function oudVoor(where: { createdAt: { lt: Date } }) {
  return h.rijen.filter((r) => r.createdAt < where.createdAt.lt);
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiUsageLog: {
      count: async ({ where }: { where: { createdAt: { lt: Date } } }) => {
        if (h.fout) throw h.fout;
        return oudVoor(where).length;
      },
      findMany: async ({ where, take }: { where: { createdAt: { lt: Date } }; take: number }) =>
        oudVoor(where)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(0, take)
          .map((r) => ({ id: r.id })),
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        const weg = new Set(where.id.in);
        h.verwijderd.push(...where.id.in);
        h.rijen = h.rijen.filter((r) => !weg.has(r.id));
        return { count: weg.size };
      },
    },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/internal-auth", () => ({ checkInternalToken: () => ({ ok: true }) }));
vi.mock("@/lib/metrics", () => ({ recordCronRun: (_job: string, ok: boolean) => void h.runs.push(ok) }));
vi.mock("@/lib/ai/watchdog", () => ({ checkLlm: async () => ({ up: true }) }));
vi.mock("@/lib/ops/heartbeat", () => ({ checkCronHeartbeats: async () => ({ stale: [] }) }));

import { AI_GEBRUIK_DAGEN, aiGebruikGrens, ruimAiGebruikOp } from "@/lib/ai/gebruik-opruimen";
import { GET } from "@/app/api/internal/ai/watchdog/route";

const rij = (id: string, dagenOud: number) => ({ id, createdAt: new Date(NU.getTime() - dagenOud * DAG) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  h.rijen = [rij("vers", 1), rij("grens", AI_GEBRUIK_DAGEN - 1), rij("oud-1", 120), rij("oud-2", 95), rij("oud-3", 200)];
  h.verwijderd = [];
  h.fout = null;
  h.runs = [];
});

describe("AI-gebruikslog opruimen", () => {
  it("de grens ligt 90 dagen terug", () => {
    expect(aiGebruikGrens(NU).toISOString()).toBe("2026-08-15T07:00:00.000Z");
  });

  it("droog telt alleen en verwijdert niets", async () => {
    expect(await ruimAiGebruikOp({ nu: NU, droog: true })).toEqual({ oud: 3, verwijderd: 0 });
    expect(h.verwijderd).toEqual([]);
    expect(h.rijen).toHaveLength(5);
  });

  it("verwijdert alleen rijen ouder dan 90 dagen", async () => {
    expect(await ruimAiGebruikOp({ nu: NU })).toEqual({ oud: 3, verwijderd: 3 });
    expect(h.rijen.map((r) => r.id).sort()).toEqual(["grens", "vers"]);
  });

  it("begrensd per keer, de oudste eerst", async () => {
    expect(await ruimAiGebruikOp({ nu: NU, max: 2 })).toEqual({ oud: 3, verwijderd: 2 });
    expect(h.verwijderd).toEqual(["oud-3", "oud-1"]);
    expect(await ruimAiGebruikOp({ nu: NU, max: 2 })).toEqual({ oud: 1, verwijderd: 1 });
    expect(await ruimAiGebruikOp({ nu: NU, max: 2 })).toEqual({ oud: 0, verwijderd: 0 });
  });

  it("de watchdog ruimt mee op; ?droog=1 telt alleen", async () => {
    const droog = (await (await GET(new Request("http://app:3000/api/internal/ai/watchdog?droog=1"))).json()) as { aiGebruik: unknown };
    expect(droog.aiGebruik).toEqual({ oud: 3, verwijderd: 0 });
    expect(h.rijen).toHaveLength(5);
    const echt = (await (await GET(new Request("http://app:3000/api/internal/ai/watchdog"))).json()) as { ok: boolean; aiGebruik: unknown };
    expect(echt).toMatchObject({ ok: true, aiGebruik: { oud: 3, verwijderd: 3 } });
    expect(h.runs).toEqual([true, true]);
  });

  it("een storing in het opruimen houdt de watchdog niet tegen", async () => {
    h.fout = new Error("db weg");
    const uit = (await (await GET(new Request("http://app:3000/api/internal/ai/watchdog"))).json()) as { ok: boolean; aiGebruik: unknown };
    expect(uit).toMatchObject({ ok: true, aiGebruik: null });
    expect(h.runs).toEqual([true]);
  });
});
