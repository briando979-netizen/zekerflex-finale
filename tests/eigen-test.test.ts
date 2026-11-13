import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// "Eigen test (telt niet mee)" (13 nov 2026): bedrijven en accounts van de eigenaar zelf, zonder ze te hernoemen. Ze tellen
// niet mee in de trechters, en klussen van zo'n bedrijf gelden als testklus, maar alleen klussen van na de markering.

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>(), audit: [] as { action: string; targetType?: string | null; targetId?: string | null }[] }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (h.kv.has(k) ? h.kv.get(k) : null),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: async (a: { action: string; targetType?: string | null; targetId?: string | null }) => void h.audit.push(a) }));

import { isEigenTestAccount, isEigenTestKlus, leesEigenTestWaarde, schakelEigenTest, type EigenTest } from "@/lib/admin/eigen-test-kern";
import { EIGEN_TEST_SLEUTEL, leesEigenTest, zetEigenTest } from "@/lib/admin/eigen-test";
import { isTestklus } from "@/lib/shifts/testklus";
import { isTestAccount } from "@/lib/admin/onboarding-model";

const sinds = "2026-11-13T12:00:00.000Z";
const et: EigenTest = { tenants: { t_jan: sinds }, users: { u_eigen: sinds } };

describe("wie en wat is eigen test", () => {
  it("een account zelf, of via een van zijn bedrijven", () => {
    expect(isEigenTestAccount(et, { userId: "u_eigen" })).toBe(true);
    expect(isEigenTestAccount(et, { userId: "u_ander", tenantIds: ["t_x", "t_jan"] })).toBe(true);
    expect(isEigenTestAccount(et, { userId: "u_ander", tenantIds: ["t_x"] })).toBe(false);
    expect(isEigenTestAccount(null, { userId: "u_eigen" })).toBe(false);
    // geen sleutel uit het prototype
    expect(isEigenTestAccount(et, { userId: "constructor", tenantIds: ["toString"] })).toBe(false);
  });

  it("een klus telt alleen als hij op of na de markering is aangemaakt", () => {
    expect(isEigenTestKlus(et, { tenantId: "t_jan", createdAt: new Date("2026-11-13T12:00:00Z") })).toBe(true);
    expect(isEigenTestKlus(et, { tenantId: "t_jan", createdAt: "2026-11-14T08:00:00Z" })).toBe(true);
    expect(isEigenTestKlus(et, { tenantId: "t_jan", createdAt: new Date("2026-11-12T23:59:00Z") })).toBe(false);
    expect(isEigenTestKlus(et, { tenantId: "t_ander", createdAt: new Date("2026-11-14T08:00:00Z") })).toBe(false);
    expect(isEigenTestKlus(et, { tenantId: null, createdAt: new Date() })).toBe(false);
    expect(isEigenTestKlus(null, { tenantId: "t_jan", createdAt: new Date() })).toBe(false);
  });

  it("isTestklus en isTestAccount nemen het kenmerk mee", () => {
    expect(isTestklus({ title: "Bediening", bedrijf: "Jan", eigenTest: true })).toBe(true);
    expect(isTestklus({ title: "Bediening", bedrijf: "Jan" })).toBe(false);
    expect(isTestAccount({ email: "jan@gmail.com", rollen: ["HQ_ADMIN"], disabledAt: null, tenantNamen: ["Jan"], eigenTest: true })).toBe(true);
    expect(isTestAccount({ email: "jan@gmail.com", rollen: ["HQ_ADMIN"], disabledAt: null, tenantNamen: ["Jan"] })).toBe(false);
  });

  it("schakelen: aan houdt de eerste datum, uit haalt hem eruit; rommel uit KV valt weg", () => {
    const nu = new Date("2026-11-20T10:00:00Z");
    expect(schakelEigenTest(et, "tenant", "t_jan", true, nu).tenants["t_jan"]).toBe(sinds);
    expect(schakelEigenTest(et, "tenant", "t_nieuw", true, nu).tenants["t_nieuw"]).toBe(nu.toISOString());
    expect(schakelEigenTest(et, "user", "u_eigen", false, nu).users).toEqual({});
    expect(leesEigenTestWaarde({ tenants: { a: sinds, b: "geen datum", c: 5 }, users: ["x"] })).toEqual({ tenants: { a: sinds }, users: {} });
    expect(leesEigenTestWaarde(null)).toEqual({ tenants: {}, users: {} });
  });
});

describe("bewaren en lezen", () => {
  beforeEach(() => {
    h.kv.clear();
    h.audit.length = 0;
    (globalThis as { __zfEigenTest?: unknown }).__zfEigenTest = undefined;
  });

  it("zetten schrijft de set, met een regel in de audit, en lezen ziet het meteen (de cache wordt gewist)", async () => {
    expect(await leesEigenTest()).toEqual({ tenants: {}, users: {} });
    await zetEigenTest("tenant", "t_jan", true, { userId: "admin1" }, new Date(sinds));
    expect(h.kv.get(EIGEN_TEST_SLEUTEL)).toEqual({ tenants: { t_jan: sinds }, users: {} });
    expect(h.audit).toEqual([expect.objectContaining({ action: "eigen-test.aan", targetType: "tenant", targetId: "t_jan" })]);
    expect((await leesEigenTest()).tenants).toEqual({ t_jan: sinds });
    await zetEigenTest("tenant", "t_jan", false, { userId: "admin1" });
    expect((await leesEigenTest()).tenants).toEqual({});
    expect(h.audit.at(-1)?.action).toBe("eigen-test.uit");
  });
});

describe("bewaker: elke plek die over een testklus beslist, geeft het kenmerk mee", () => {
  it("isTestklus({...}) in lib/ heeft eigenTest (behalve de bedrijfsnaam-regel in onboarding-model)", () => {
    const uit: string[] = [];
    const loop = (dir: string) => {
      for (const naam of readdirSync(dir)) {
        const p = path.join(dir, naam);
        if (statSync(p).isDirectory()) loop(p);
        else if (/\.tsx?$/.test(naam)) uit.push(p);
      }
    };
    loop(path.join(process.cwd(), "lib"));
    const zonder: string[] = [];
    for (const f of uit) {
      const rel = path.relative(process.cwd(), f).replace(/\\/g, "/");
      if (rel === "lib/shifts/testklus.ts" || rel === "lib/admin/onboarding-model.ts") continue;
      for (const m of readFileSync(f, "utf8").matchAll(/isTestklus\(\{[^}]*\}/g)) {
        if (!m[0].includes("eigenTest")) zonder.push(`${rel}: ${m[0].slice(0, 80)}`);
      }
    }
    expect(zonder).toEqual([]);
  });
});
