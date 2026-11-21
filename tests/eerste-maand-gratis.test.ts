import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// 21 nov 2026 (eigenaar): "eerste maand gratis voor bedrijven, zet op auto". Bij de eerste goedgekeurde dienst van een bedrijf
// zonder gratis maand begint die vanzelf: 30 dagen vanaf de dag van die dienst, dezelfde opslag als de Partnerdeal.

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => h.kv.get(k) ?? null),
  kvSetIfAbsent: vi.fn(async (k: string, v: unknown) => {
    if (h.kv.has(k)) return false;
    h.kv.set(k, v);
    return true;
  }),
  kvListValues: vi.fn(async () => [...h.kv.values()]),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));

import { partnerdealZonderFee, startEersteMaandGratis } from "@/lib/billing/partnerdeal-vrij";

const dag = (s: string) => new Date(`${s}T10:00:00+01:00`);

describe("eerste maand gratis, automatisch", () => {
  it("begint bij de eerste dienst en duurt 30 dagen, naar de dag in Amsterdam", async () => {
    h.kv.clear();
    expect(await startEersteMaandGratis({ tenantId: "t1", bedrijf: "Café De Hoek", eersteDienst: dag("2027-01-05") })).toBe(true);
    expect(await partnerdealZonderFee("t1", dag("2027-01-05"))).toBe(true);
    expect(await partnerdealZonderFee("t1", dag("2027-02-03"))).toBe(true);
    expect(await partnerdealZonderFee("t1", dag("2027-02-04"))).toBe(false);
    expect(await partnerdealZonderFee("t1", dag("2027-01-04"))).toBe(false);
  });

  it("één keer per bedrijf: een tweede dienst of een al gegeven Partnerdeal verandert niets", async () => {
    h.kv.clear();
    await startEersteMaandGratis({ tenantId: "t2", bedrijf: "Bedrijf", eersteDienst: dag("2027-01-05") });
    expect(await startEersteMaandGratis({ tenantId: "t2", bedrijf: "Bedrijf", eersteDienst: dag("2027-03-01") })).toBe(false);
    expect(await partnerdealZonderFee("t2", dag("2027-03-01"))).toBe(false);
  });

  it("wordt bij het goedkeuren aangeroepen, in beide sporen, achter de vlag (standaard aan)", () => {
    const approve = readFileSync(path.join(process.cwd(), "lib/timesheets/approve.ts"), "utf8");
    expect(approve.match(/await eersteMaandGratisAlsAan\(ts\.branch\.tenantId, ts\.branch\.tenant\.name, ts\.scheduledStart\)/g)).toHaveLength(2);
    const vlaggen = readFileSync(path.join(process.cwd(), "lib/flags/index.ts"), "utf8");
    expect(vlaggen).toMatch(/key: "eerste-maand-gratis"[^\n]*default: true/);
  });
});
