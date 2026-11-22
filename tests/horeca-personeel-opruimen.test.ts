import { beforeEach, describe, expect, it, vi } from "vitest";

// Het eigen personeel van een horecazaak is op 22 nov 2026 weggehaald (fase C), maar wat een zaak ooit bewaarde blijft in
// de opslag. Wist een bedrijf zijn account (lib/privacy/org-wissen.ts), dan gaan ook de pdf-bestanden van loonstroken en
// documenten weg (lib/horeca-personeel/opruimen.ts).

const m = vi.hoisted(() => ({ kv: new Map<string, unknown>(), gewist: [] as string[] }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null) }));
vi.mock("@/lib/storage/local", () => ({
  deleteUpload: async (id: string) => {
    if (id === "kapot") throw new Error("al weg");
    m.gewist.push(id);
  },
}));

import { bestandIdsVan, wisPersoneelBestanden } from "@/lib/horeca-personeel/opruimen";

const T = "tenantAAAA1";

beforeEach(() => {
  m.kv.clear();
  m.gewist = [];
});

describe("de bestanden van het eigen personeel opruimen", () => {
  it("vindt de bestanden van loonstroken en documenten; rommel in de opslag telt niet mee", async () => {
    m.kv.set(`horeca:loonstroken:${T}`, [{ uploadId: "up1" }, { uploadId: "" }, null]);
    m.kv.set(`horeca:documenten:${T}`, [{ uploadId: "up2" }, { titel: "zonder bestand" }]);
    m.kv.set("horeca:documenten:tenantBBBB2", { rommel: true });
    expect(await bestandIdsVan(T)).toEqual(["up1", "up2"]);
    expect(await bestandIdsVan("tenantBBBB2")).toEqual([]);
  });

  it("wist elk bestand; een bestand dat al weg is, is geen fout", async () => {
    m.kv.set(`horeca:loonstroken:${T}`, [{ uploadId: "up1" }, { uploadId: "kapot" }]);
    m.kv.set(`horeca:documenten:${T}`, [{ uploadId: "up2" }]);
    expect(await wisPersoneelBestanden(T)).toBe(3);
    expect(m.gewist).toEqual(["up1", "up2"]);
    expect(await wisPersoneelBestanden("tenantCCCC3")).toBe(0);
  });
});
