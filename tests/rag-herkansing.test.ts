import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HERKANSING_KV, HERKANSING_NA_MS, MAX_UITSTEL, besluit, nieuweHerkansing } from "@/lib/rag/herkansing";

// 13 nov 00:01: de cron rag/reindex viel in een uitrol ("rag indexer failed" 3×, time-out), en de social-tick viel terug op
// vaste teksten. Nu: tijdens een uitrol overslaan met een herkansing over ±30 min; geen fout; een waarschuwing alleen
// als ook de herkansing faalt.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  bezig: false,
  reindex: vi.fn(),
  tick: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  cron: vi.fn(),
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
  kvDelete: async (k: string) => void h.kv.delete(k),
}));
vi.mock("@/lib/bouwer/live", () => ({ K_STATUS: "bouwer:live:status", uitrolHoudtModelStil: () => h.bezig }));
vi.mock("@/lib/rag/reindex", () => ({ reindexAll: (...a: unknown[]) => h.reindex(...a) }));
vi.mock("@/lib/logger", () => ({ logger: h.log }));
vi.mock("@/lib/metrics", () => ({ recordCronRun: (...a: unknown[]) => h.cron(...a) }));
vi.mock("@/lib/internal-auth", () => ({ checkInternalToken: () => ({ ok: true }) }));
vi.mock("@/lib/social/publiceer", () => ({ socialTick: (...a: unknown[]) => h.tick(...a) }));
vi.mock("@/lib/ops/heartbeat", () => ({ recordCronHeartbeat: vi.fn() }));

const rag = await import("@/app/api/internal/rag/reindex/route");
const social = await import("@/app/api/internal/social/tick/route");
const roep = (q = "") => (rag.GET as (r: Request) => Promise<Response>)(new Request(`http://app:3000/api/internal/rag/reindex${q}`));
const goed = { code: 1, audit: 1, legal: 1, sales: 1, database: 1, interaction: 1, mislukt: [] };
const fout = { ...goed, mislukt: [{ indexer: "code", fout: "The operation was aborted due to timeout" }] };
const NU = Date.parse("2026-11-13T01:00:00+01:00");

beforeEach(() => {
  h.kv.clear();
  h.bezig = false;
  for (const f of [h.reindex, h.tick, h.log.info, h.log.warn, h.log.error, h.cron]) f.mockReset();
});

describe("besluit (puur)", () => {
  it("gewone run: tijdens een uitrol uitstellen, anders draaien", () => {
    expect(besluit({ herkansingRun: false, uitrolBezig: true, herkansing: null, nu: NU })).toBe("uitstellen");
    expect(besluit({ herkansingRun: false, uitrolBezig: false, herkansing: null, nu: NU })).toBe("draai");
  });

  it("herkansing: alleen als hij er is en aan de beurt is; bij een nieuwe uitrol nog eens uitstellen, hooguit MAX_UITSTEL keer", () => {
    const h0 = nieuweHerkansing(NU);
    expect(Date.parse(h0.vanaf) - NU).toBe(HERKANSING_NA_MS);
    expect(besluit({ herkansingRun: true, uitrolBezig: false, herkansing: null, nu: NU })).toBe("niets");
    expect(besluit({ herkansingRun: true, uitrolBezig: false, herkansing: h0, nu: NU })).toBe("niets");
    expect(besluit({ herkansingRun: true, uitrolBezig: false, herkansing: h0, nu: NU + HERKANSING_NA_MS })).toBe("draai");
    expect(besluit({ herkansingRun: true, uitrolBezig: true, herkansing: h0, nu: NU + HERKANSING_NA_MS })).toBe("uitstellen");
    expect(besluit({ herkansingRun: true, uitrolBezig: true, herkansing: { ...h0, uitstel: MAX_UITSTEL }, nu: NU + HERKANSING_NA_MS })).toBe("draai");
  });
});

describe("cron rag/reindex", () => {
  it("tijdens een uitrol: niet draaien, een herkansing zetten, geen fout", async () => {
    h.bezig = true;
    const r = await (await roep()).json();
    expect(r.overgeslagen).toBe("uitrol bezig");
    expect(h.reindex).not.toHaveBeenCalled();
    expect(h.kv.get(HERKANSING_KV)).toMatchObject({ reden: "uitrol", uitstel: 0 });
    expect(h.log.error).not.toHaveBeenCalled();
    expect(h.log.warn).not.toHaveBeenCalled();
  });

  it("de herkansing-cron zonder herkansing: meteen klaar, niets gedraaid", async () => {
    const r = await (await roep("?herkansing=1")).json();
    expect(r.overgeslagen).toBe("geen herkansing aan de beurt");
    expect(h.reindex).not.toHaveBeenCalled();
  });

  it("herkansing aan de beurt en gelukt: de vlag gaat weg", async () => {
    h.kv.set(HERKANSING_KV, { vanaf: "2026-11-12T00:00:00.000Z", reden: "uitrol", uitstel: 0 });
    h.reindex.mockResolvedValue(goed);
    await roep("?herkansing=1");
    expect(h.reindex).toHaveBeenCalledWith({ stil: true });
    expect(h.kv.has(HERKANSING_KV)).toBe(false);
    expect(h.log.warn).not.toHaveBeenCalled();
  });

  it("ook de herkansing faalt: één waarschuwing (geen fout), en niet nog eens", async () => {
    h.kv.set(HERKANSING_KV, { vanaf: "2026-11-12T00:00:00.000Z", reden: "uitrol", uitstel: 0 });
    h.reindex.mockResolvedValue(fout);
    await roep("?herkansing=1");
    expect(h.log.warn).toHaveBeenCalledTimes(1);
    expect(h.log.error).not.toHaveBeenCalled();
    expect(h.kv.has(HERKANSING_KV)).toBe(false);
  });

  it("een uitrol begon halverwege: geen fout, een herkansing", async () => {
    h.reindex.mockImplementation(async () => {
      h.bezig = true;
      return fout;
    });
    await roep();
    expect(h.log.error).not.toHaveBeenCalled();
    expect(h.kv.get(HERKANSING_KV)).toMatchObject({ reden: "uitrol" });
  });

  it("zonder uitrol een mislukte indexer: gewoon de fout, zoals voorheen", async () => {
    h.reindex.mockResolvedValue(fout);
    await roep();
    expect(h.log.error).toHaveBeenCalledWith("rag indexer failed", { indexer: "code", error: "The operation was aborted due to timeout" });
    expect(h.kv.has(HERKANSING_KV)).toBe(false);
  });
});

describe("social-tick en de cron", () => {
  it("de social-tick slaat een uitrol over (de volgende tik is de herkansing)", async () => {
    h.bezig = true;
    const r = await (await (social.GET as (r: Request) => Promise<Response>)(new Request("http://app:3000/api/internal/social/tick"))).json();
    expect(r.overgeslagen).toBe("uitrol bezig");
    expect(h.tick).not.toHaveBeenCalled();
  });

  it("de herkansing staat elk kwartier in de cron", () => {
    expect(readFileSync(path.join(process.cwd(), "deploy/cron/entrypoint.sh"), "utf8")).toMatch(/^\*\/15 \* \* \* \* wget .*\/api\/internal\/rag\/reindex\?herkansing=1"\r?$/m);
  });
});
