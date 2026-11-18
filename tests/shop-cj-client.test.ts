import { beforeEach, describe, expect, it, vi } from "vitest";

// De CJ-client (lib/shop/cj/cj-client.ts) leest het antwoord van CJ soepel: product/stock/getInventoryByPid stuurt géén
// veld `result` mee (18 nov 2026: 89 keer "cj: voorraad niet opgehaald" met een lege melding, terwijl de voorraad er wél
// in stond en 97 producten "uitverkocht" bleven). Alleen een uitdrukkelijk `result: false`, een andere code dan 200 of
// ontbrekende data telt als fout.

vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (key: string) => (key === "shop:cj:token" ? { accessToken: "proef-bewijs", verlooptOp: "2099-01-01T00:00:00.000Z" } : null)),
  kvSet: vi.fn(async () => undefined),
  kvDelete: vi.fn(async () => undefined),
}));

import { cjGet, cjVoorraadPerVariant } from "@/lib/shop/cj/cj-client";

const antwoord = (body: unknown, status = 200): Response => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
let haal: ReturnType<typeof vi.fn>;

beforeEach(() => {
  haal = vi.fn();
  vi.stubGlobal("fetch", haal);
});

describe("de CJ-client leest het antwoord soepel", () => {
  it("getInventoryByPid zonder `result` is gewoon geslaagd: de voorraad per variant komt door", async () => {
    haal.mockResolvedValueOnce(
      antwoord({
        code: 200,
        message: "",
        data: { inventories: [], variantInventories: [{ vid: "v-1", inventory: [{ countryCode: "DE", totalInventory: 52 }, { countryCode: "CN", totalInventory: 3 }] }] },
      }),
    );
    const voorraad = await cjVoorraadPerVariant("p-1");
    expect(voorraad.get("v-1")).toBe(55);
    expect(String(haal.mock.calls[0]?.[0])).toContain("product/stock/getInventoryByPid?pid=p-1");
    expect((haal.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers["CJ-Access-Token"]).toBe("proef-bewijs");
  });

  it("een uitdrukkelijk result: false, een andere code of ontbrekende data is wél een fout", async () => {
    haal.mockResolvedValueOnce(antwoord({ code: 200, result: false, message: "Pid not found", data: null }));
    await expect(cjGet("product/query", { pid: "x" })).rejects.toThrow("CJ: Pid not found");
    haal.mockResolvedValueOnce(antwoord({ code: 1600100, result: true, message: "Interface not enabled", data: null }));
    await expect(cjGet("product/query", { pid: "x" })).rejects.toThrow("CJ: Interface not enabled");
    haal.mockResolvedValueOnce(antwoord({ code: 200, result: true, message: "Success" }));
    await expect(cjGet("product/query", { pid: "x" })).rejects.toThrow("CJ: Success");
  }, 10_000);
});
