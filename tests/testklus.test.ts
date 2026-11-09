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
