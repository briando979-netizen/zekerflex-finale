import { beforeEach, describe, expect, it, vi } from "vitest";

// Een indexer die faalt terwijl een uitrol het eigen model stilhoudt, is geen storing (13 nov: 3× "rag indexer failed" met
// "The operation was aborted due to timeout", vlak voor de herstart van de app). Buiten een uitrol blijft het een fout.

const status = vi.hoisted(() => ({ waarde: null as unknown }));
const log = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/rag/embed", () => ({ embedMany: async () => [], isRagEnabled: () => true }));
vi.mock("@/lib/rag/store", () => ({ replaceSource: async () => 0 }));
vi.mock("@/lib/rag/corpus", () => ({ corpus: async () => [] }));
vi.mock("@/lib/logger", () => ({ logger: log }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => status.waarde }));

import { safely } from "@/lib/rag/reindex";

const faalt = async () => {
  throw new Error("The operation was aborted due to timeout");
};

beforeEach(() => {
  status.waarde = null;
  vi.clearAllMocks();
});

describe("rag-indexer tijdens een uitrol", () => {
  it("gaat het goed, dan komt het aantal terug", async () => {
    expect(await safely("code", async () => 7)).toBe(7);
    expect(log.error).not.toHaveBeenCalled();
  });

  it("een timeout buiten een uitrol blijft een fout in het logboek", async () => {
    expect(await safely("code", faalt)).toBe(0);
    expect(log.error).toHaveBeenCalledWith("rag indexer failed", { indexer: "code", error: "The operation was aborted due to timeout" });
  });

  it("een timeout tijdens een uitrol is geen fout, alleen een melding", async () => {
    status.waarde = { staat: "bezig", bijgewerkt: new Date(Date.now() - 5 * 60_000).toISOString() };
    expect(await safely("code", faalt)).toBe(0);
    expect(log.error).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith("rag indexer overgeslagen: uitrol bezig", { indexer: "code", error: "The operation was aborted due to timeout" });
  });

  it("een uitrol van lang geleden telt niet meer: weer een fout", async () => {
    status.waarde = { staat: "klaar", bijgewerkt: new Date(Date.now() - 3 * 3_600_000).toISOString() };
    await safely("code", faalt);
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});
