import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { shift: { findMany } } }));

const { isTestklus } = await import("@/lib/shifts/testklus");
const { publicOpenShifts } = await import("@/lib/public-shifts");

describe("isTestklus", () => {
  it.each([
    [{ title: "Orderpicker", bedrijf: "Test bedrijven" }],
    [{ title: "Kasmedewerker (test klus)", bedrijf: "Bakkerij Jansen" }],
    [{ title: "Testklus bediening", bedrijf: null }],
    [{ title: "Allround medewerker", bedrijf: "test" }],
  ])("herkent %o", (s) => {
    expect(isTestklus(s)).toBe(true);
  });

  it.each([
    [{ title: "Orderpicker", bedrijf: "Bakkerij Jansen" }],
    [{ title: "Kwaliteitstester elektronica", bedrijf: "Testo Nederland B.V." }], // geen "test …"-bedrijf
    [{ title: "Testmonteur", bedrijf: "Volvo" }],
  ])("laat echte klussen staan: %o", (s) => {
    expect(isTestklus(s)).toBe(false);
  });
});

const rij = (id: string, bedrijf: string, title = "Orderpicker") => ({
  id,
  title,
  description: null,
  startsAt: new Date("2026-12-01T09:00:00+01:00"),
  endsAt: new Date("2026-12-01T17:00:00+01:00"),
  hourlyRateCents: 1650,
  positions: 1,
  viaUitzendbureau: false,
  createdAt: new Date("2026-11-06T02:00:00+01:00"),
  requiredSkill: null,
  branch: { city: "Roermond", postalCode: "6041AA", latitude: 51.19, longitude: 5.99, tenant: { name: bedrijf } },
});

describe("openbare klussen zonder testklussen", () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([rij("echt", "Bakkerij Jansen"), rij("nep", "Test bedrijven")]);
  });

  it("de lijst voor /klussen, sitemap en feed laat testklussen weg", async () => {
    const out = await publicOpenShifts({ take: 60 });
    expect(out.map((s) => s.id)).toEqual(["echt"]);
  });

  it("op de eigen site van een bedrijf blijven ze staan, met de vlag erbij", async () => {
    const out = await publicOpenShifts({ tenantId: "t1" });
    expect(out.map((s) => [s.id, s.testklus])).toEqual([
      ["echt", false],
      ["nep", true],
    ]);
  });
});

describe("werker-app: echte klussen eerst", () => {
  it("zet testklussen onderaan en laat de rest in volgorde", async () => {
    const { echteKlussenEerst } = await import("@/lib/shifts/testklus");
    const lijst = [
      { id: "t1", testklus: true },
      { id: "e1", testklus: false },
      { id: "t2", testklus: true },
      { id: "e2", testklus: false },
    ];
    expect([...lijst].sort(echteKlussenEerst).map((s) => s.id)).toEqual(["e1", "e2", "t1", "t2"]);
  });

  it("zegt alleen 'alleen testklussen' als er iets is en alles test is", async () => {
    const { alleenTestklussen } = await import("@/lib/shifts/testklus");
    expect(alleenTestklussen([])).toBe(false); // lege lijst: de gewone lege staat
    expect(alleenTestklussen([{ testklus: true }, { testklus: true }])).toBe(true);
    expect(alleenTestklussen([{ testklus: true }, { testklus: false }])).toBe(false);
  });
});
