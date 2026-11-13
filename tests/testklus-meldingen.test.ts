import { beforeEach, describe, expect, it, vi } from "vitest";

// Testklussen en meldingen (13 nov 2026, gemeten: alle 103 open klussen waren testklussen; een geo-push over een testklus
// bereikte een echte werker, en één echte werker volgde het testbedrijf). Volgers, job-alerts, stand-by, "in de buurt" en de
// spoedoproep (ook sms/WhatsApp) vragen nu allemaal hetzelfde filter (lib/shifts/testklus-db.ts): een gewone klus naar
// iedereen, een testklus alleen naar interne accounts. In de klussenlijst blijft hij zichtbaar, met label.

const h = vi.hoisted(() => ({
  intern: new Map<string, string[]>(),
  vragen: [] as string[],
  eigenTest: { tenants: {} as Record<string, string>, users: {} as Record<string, string> },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: {
      findMany: async (args: { where: { user: { OR: { memberships?: { some: { OR: { tenantId?: string }[] } } }[] } } }) => {
        const tenantId = args.where.user.OR[0]?.memberships?.some.OR.find((o) => o.tenantId)?.tenantId ?? "";
        h.vragen.push(tenantId);
        return (h.intern.get(tenantId) ?? []).map((userId) => ({ id: `f-${userId}`, userId }));
      },
    },
  },
}));
vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: async () => h.eigenTest }));

import { klusKenmerk, testklusMeldfilter } from "@/lib/shifts/testklus-db";

const klus = (over: Partial<{ title: string; tenantId: string; bedrijf: string; createdAt: string }> = {}) => ({
  title: "Afwasser",
  tenantId: "t1",
  bedrijf: "Café De Brug",
  createdAt: "2026-11-12T10:00:00Z",
  ...over,
});

beforeEach(() => {
  h.intern = new Map([["t-test", ["intern"]], ["t1", ["lid-t1"]]]);
  h.vragen = [];
  h.eigenTest = { tenants: {}, users: {} };
});

describe("het meldfilter voor testklussen", () => {
  it("een gewone klus mag naar iedereen, zonder iets op te vragen", async () => {
    const f = await testklusMeldfilter();
    expect(f.isTest(klus())).toBe(false);
    expect(await f.mag(klus(), "wie-dan-ook")).toBe(true);
    expect(h.vragen).toEqual([]);
  });

  it("een testklus (bedrijf 'Test …') alleen naar interne accounts; één keer opvragen per bedrijf", async () => {
    const f = await testklusMeldfilter();
    const t = klus({ tenantId: "t-test", bedrijf: "Test bedrijven" });
    expect(f.isTest(t)).toBe(true);
    expect(await f.mag(t, "echt")).toBe(false);
    expect(await f.mag(t, "intern")).toBe(true);
    expect(await f.mag(t, "nog-een-echte")).toBe(false);
    expect(h.vragen).toEqual(["t-test"]);
  });

  it("ook 'testklus' in de titel bij een echt bedrijf, en een eigen-testbedrijf vanaf het markeren", async () => {
    h.eigenTest = { tenants: { t1: "2026-11-10T00:00:00Z" }, users: {} };
    const f = await testklusMeldfilter();
    expect(f.isTest(klus({ title: "Testklus kassa", tenantId: "t2", bedrijf: "Hotel B" }))).toBe(true);
    expect(f.isTest(klus({ createdAt: "2026-11-12T10:00:00Z" }))).toBe(true);
    expect(f.isTest(klus({ createdAt: "2026-11-09T10:00:00Z" }))).toBe(false);
    expect(await f.mag(klus(), "lid-t1")).toBe(true);
    expect(await f.mag(klus(), "echt")).toBe(false);
  });

  it("het kenmerk uit een klusrij, ook zonder bedrijf of aanmaakdatum", () => {
    const createdAt = new Date("2026-11-12T10:00:00Z");
    expect(klusKenmerk({ title: "Afwasser", createdAt, branch: { tenantId: "t1", tenant: { name: "Test bedrijven" } } })).toEqual({ title: "Afwasser", tenantId: "t1", bedrijf: "Test bedrijven", createdAt });
    expect(klusKenmerk({ title: "Afwasser", branch: { tenantId: "t1" } })).toEqual({ title: "Afwasser", tenantId: "t1", bedrijf: null, createdAt: null });
  });
});
