import { describe, expect, it, vi } from "vitest";

const vandaag = new Date("2026-11-04T10:00:00Z");
const tellingen: { where: { start: { gte: Date; lt: Date } } }[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    rijschool: { findUnique: vi.fn(async ({ where }: { where: { tenantId: string } }) => (where.tenantId === "t1" ? { id: "r1", naam: "Rijschool Test", slug: "rijschool-test", online: true } : null)) },
    rijschoolLeerling: {
      groupBy: vi.fn(async () => [
        { status: "ACTIEF", _count: { _all: 7 } },
        { status: "AANMELDING", _count: { _all: 2 } },
        { status: "GESLAAGD", _count: { _all: 4 } },
      ]),
      findMany: vi.fn(async () => [{ id: "a" }, { id: "b" }, { id: "c" }]),
    },
    rijschoolLes: {
      count: vi.fn(async (q: { where: { start: { gte: Date; lt: Date } } }) => {
        tellingen.push(q);
        return q.where.start.lt.getTime() - q.where.start.gte.getTime() > 2 * 86_400_000 ? 12 : 3;
      }),
    },
    rijschoolBetaling: { aggregate: vi.fn(async () => ({ _count: { _all: 2 }, _sum: { bedragCent: 9500 } })) },
    rijschoolBericht: { count: vi.fn(async () => 4) },
  },
}));
vi.mock("@/lib/rijschool/store", () => ({
  saldiVan: vi.fn(async () => new Map([["a", -60], ["b", 120]])),
}));

import { rijschoolKerncijfers } from "@/lib/rijschool/kerncijfers";

describe("rijschoolKerncijfers", () => {
  it("geeft null zonder rijschool-pakket", async () => {
    expect(await rijschoolKerncijfers("onbekend", vandaag)).toBeNull();
  });

  it("telt leerlingen, lessen, tekort en openstaande betalingen", async () => {
    const k = await rijschoolKerncijfers("t1", vandaag);
    expect(k).toMatchObject({
      naam: "Rijschool Test",
      leerlingenActief: 7,
      aanmeldingen: 2,
      lessenVandaag: 3,
      lessenKomendeWeek: 12,
      tegoedTekort: 1,
      openBetalingen: 2,
      openBetalingenCent: 9500,
      ongelezenBerichten: 4,
      beheerUrl: "/werkgever/rijschool",
    });
    expect(k?.siteUrl).toMatch(/\/rijschool\/rijschool-test$/);
    // vandaag = Nederlandse dag: 4 november 00:00 in Amsterdam is 3 november 23:00 UTC
    expect(tellingen[0]?.where.start.gte.toISOString()).toBe("2026-11-03T23:00:00.000Z");
    expect(tellingen[0]?.where.start.lt.toISOString()).toBe("2026-11-04T23:00:00.000Z");
  });
});
