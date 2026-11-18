import { beforeEach, describe, expect, it, vi } from "vitest";

// CJ-foto's van de database naar schijf (18 nov 2026, lib/shop/cj/fotos-verhuizen.ts): alleen de foto's van CJ-producten
// die nog een db:-sleutel hebben, droge telling zonder wijzigingen, en de echte ronde binnen een budget met verkleining.

vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const audit = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => audit(...a) }));
const producten = vi.fn();
const uploads = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { shopProduct: { findMany: (...a: unknown[]) => producten(...a) }, upload: { findMany: (...a: unknown[]) => uploads(...a) } } }));
const readUpload = vi.fn();
const verhuis = vi.fn();
vi.mock("@/lib/storage/local", () => ({ readUpload: (...a: unknown[]) => readUpload(...a), verhuisUploadNaarSchijf: (...a: unknown[]) => verhuis(...a) }));
const cleanImage = vi.fn();
vi.mock("@/lib/media/clean-image", () => ({ cleanImage: (...a: unknown[]) => cleanImage(...a) }));

import { cjFotoUploadIds, cjFotosTeVerhuizen, telCjFotos, verhuisCjFotos } from "@/lib/shop/cj/fotos-verhuizen";

beforeEach(() => {
  vi.clearAllMocks();
  producten.mockResolvedValue([
    { imageUploadId: "upl-0001-aaaa", fotos: ["/api/shop/media/upl-0002-bbbb", "https://cdn.cj.example/los.jpg", "/api/shop/media/upl-0003-cccc"] },
    { imageUploadId: "upl-0002-bbbb", fotos: [] }, // dezelfde foto twee keer: één keer tellen
    { imageUploadId: null, fotos: ["/api/shop/media/upl-0004-dddd"] },
  ]);
  // u4 staat al op schijf (geen db:-sleutel) en komt niet terug uit de filter
  uploads.mockImplementation(async (arg: { where: { id: { in: string[] } } }) =>
    arg.where.id.in.filter((id) => id !== "upl-0004-dddd").map((id) => ({ id, sizeBytes: 300_000 })),
  );
  readUpload.mockImplementation(async () => ({ bytes: Buffer.alloc(300_000, 1), filename: "f.webp", mimeType: "image/webp" }));
  cleanImage.mockImplementation(async () => ({ bytes: Buffer.alloc(80_000, 2), width: 1200, height: 900, mime: "image/webp" }));
  verhuis.mockImplementation(async (_id: string, o: { bytes: Buffer }) => ({ status: "verhuisd", bytesVoor: 300_000, bytesNa: o.bytes.length }));
});

describe("CJ-foto's verhuizen", () => {
  it("verzamelt de upload-id's van CJ-producten (hoofdfoto + extra foto's, ontdubbeld, vreemde urls niet)", async () => {
    expect((await cjFotoUploadIds()).sort()).toEqual(["upl-0001-aaaa", "upl-0002-bbbb", "upl-0003-cccc", "upl-0004-dddd"]);
    const where = (producten.mock.calls[0]?.[0] as { where: unknown }).where;
    expect(where).toEqual({ variants: { some: { sku: { startsWith: "cj-" } } } });
  });

  it("telt alleen wat nog in de database staat (db:-sleutel), droog: niets wordt verhuisd", async () => {
    expect(await cjFotosTeVerhuizen()).toEqual({ ids: ["upl-0001-aaaa", "upl-0002-bbbb", "upl-0003-cccc"], aantal: 3, bytes: 900_000 });
    expect((uploads.mock.calls[0]?.[0] as { where: { storageKey: unknown } }).where.storageKey).toEqual({ startsWith: "db:" });
    const t = await telCjFotos(2);
    expect(t).toMatchObject({ droog: true, aantal: 3, bytes: 900_000, steekproef: { n: 2, bytesVoor: 600_000, bytesNa: 160_000 }, schattingBytesNa: 240_000 });
    expect(verhuis).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("verhuist verkleind naar de map cj, telt bytes voor en na, en schrijft één auditregel", async () => {
    const r = await verhuisCjFotos({ actorUserId: "admin-1" });
    expect(r).toEqual({ droog: false, gedaan: 3, mislukt: 0, rest: 0, bytesVoor: 900_000, bytesNa: 240_000 });
    expect(cleanImage).toHaveBeenCalledWith(expect.any(Buffer), 1200);
    expect(verhuis).toHaveBeenCalledTimes(3);
    expect(verhuis.mock.calls[0]?.[1]).toMatchObject({ map: "cj" });
    expect((verhuis.mock.calls[0]?.[1] as { bytes: Buffer }).bytes.length).toBe(80_000);
    expect(audit).toHaveBeenCalledTimes(1);
    expect((audit.mock.calls[0]?.[0] as unknown as { summary: string }).summary).toContain("3 verhuisd");
  });

  it("wordt een foto niet kleiner van het verkleinen, dan gaat het origineel mee; een fout telt als mislukt en de rest gaat door", async () => {
    cleanImage.mockImplementation(async () => ({ bytes: Buffer.alloc(400_000, 3), width: 1200, height: 900, mime: "image/webp" }));
    verhuis.mockImplementationOnce(async () => { throw new Error("schijf vol"); });
    const r = await verhuisCjFotos({ actorUserId: null });
    expect(r).toMatchObject({ gedaan: 2, mislukt: 1, rest: 1, bytesVoor: 600_000, bytesNa: 600_000 });
    expect((verhuis.mock.calls[1]?.[1] as { bytes: Buffer }).bytes.length).toBe(300_000);
    expect((audit.mock.calls[0]?.[0] as unknown as { actorLabel: string }).actorLabel).toBe("system:cj");
  });

  it("stopt na het budget; de rest blijft voor een volgende ronde", async () => {
    const r = await verhuisCjFotos({ actorUserId: "admin-1", budgetMs: -1 });
    expect(r).toMatchObject({ gedaan: 0, mislukt: 0, rest: 3 });
    expect(verhuis).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});
