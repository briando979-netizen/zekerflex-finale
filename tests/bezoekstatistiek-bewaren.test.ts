import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Bezoekstatistiek (AnalyticsEvent) na 13 maanden weg (13 nov 2026, besluit 86 na de db-groei-ronde: 52.652 rijen sinds
// september en nooit opgeruimd, met een userId bij wie is ingelogd). De termijn in lib/privacy/retention.ts moet gelijk zijn
// aan wat /privacy belooft, zoals bij het toegangslog (tests/caddy-log-bewaren.test.ts). De opruiming is begrensd per
// ronde, de oudste eerst, en telt alleen in een droge ronde.

const NU = new Date("2027-12-20T03:40:00Z");
const DAG = 86_400_000;
const MAAND = 365.25 / 12;

const h = vi.hoisted(() => ({
  rijen: [] as { id: string; createdAt: Date }[],
  verwijderd: [] as string[],
}));

// binnen de mock pas bij een aanroep gebruikt (vi.mock wordt naar boven gehesen)
function oudVoor(where: { createdAt: { lt: Date } }) {
  return h.rijen.filter((r) => r.createdAt < where.createdAt.lt);
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analyticsEvent: {
      count: async ({ where }: { where: { createdAt: { lt: Date } } }) => oudVoor(where).length,
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

import { retentionCutoff, retentionRule } from "@/lib/privacy/retention";
import { ruimBezoekstatistiekOp } from "@/lib/privacy/bezoekstatistiek";

const regel = retentionRule("bezoekstatistiek");
const dagen = regel?.days ?? Number.NaN;
const maanden = Math.round(dagen / MAAND);
const rij = (id: string, dagenOud: number) => ({ id, createdAt: new Date(NU.getTime() - dagenOud * DAG) });

beforeEach(() => {
  h.rijen = [rij("vers", 2), rij("net-binnen", dagen - 1), rij("oud-1", 500), rij("oud-2", dagen + 1), rij("oud-3", 800)];
  h.verwijderd = [];
});

describe("bezoekstatistiek: termijn in de code en in /privacy", () => {
  it("de regel staat er: hele maanden, weg na afloop, en weg bij een verwijderverzoek", () => {
    expect(regel).toMatchObject({ onExpiry: "delete", blocksErasure: false });
    expect(maanden).toBe(13);
    // de dagen zijn echt die maanden (hooguit een paar dagen speling), geen losse waarde
    expect(Math.abs(dagen - maanden * MAAND)).toBeLessThanOrEqual(3);
  });

  it("/privacy noemt dezelfde termijn", () => {
    const privacy = readFileSync("app/(marketing)/privacy/page.tsx", "utf8");
    expect(privacy).toContain(`We bewaren bezoekstatistieken ${maanden} maanden`);
  });
});

describe("bezoekstatistiek opruimen", () => {
  it("de grens ligt 13 maanden terug", () => {
    expect(retentionCutoff("bezoekstatistiek", NU)?.toISOString()).toBe("2026-11-20T03:40:00.000Z");
  });

  it("droog telt alleen en verwijdert niets", async () => {
    expect(await ruimBezoekstatistiekOp(NU, true)).toBe(3);
    expect(h.verwijderd).toEqual([]);
    expect(h.rijen).toHaveLength(5);
  });

  it("verwijdert alleen wat ouder is dan de termijn", async () => {
    expect(await ruimBezoekstatistiekOp(NU, false)).toBe(3);
    expect(h.rijen.map((r) => r.id).sort()).toEqual(["net-binnen", "vers"]);
  });

  it("begrensd per ronde, de oudste eerst", async () => {
    expect(await ruimBezoekstatistiekOp(NU, false, 2)).toBe(2);
    expect(h.verwijderd).toEqual(["oud-3", "oud-1"]);
    expect(await ruimBezoekstatistiekOp(NU, false, 2)).toBe(1);
    expect(await ruimBezoekstatistiekOp(NU, false, 2)).toBe(0);
  });
});
