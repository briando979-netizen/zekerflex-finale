import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvAppend: async (k: string, item: unknown, keepLast = 2000) => {
    const arr = (m.kv.has(k) ? (structuredClone(m.kv.get(k)) as unknown[]) : []).concat([item]);
    m.kv.set(k, arr.length > keepLast ? arr.slice(arr.length - keepLast) : arr);
  },
}));

import { BEWAAR_BERICHTEN, KANAAL_TEAM, MAX_BERICHT, berichtenVan, dmKanaal, kanaalToegang, plaatsBericht, verwijderBericht } from "@/lib/horeca-personeel/chat";

// De chat van het personeel: een teamkanaal en per medewerker een gesprek met de beheerder. Een medewerker kan nooit het
// gesprek van een collega lezen of schrijven.

const T = "tenantAAAA1";
beforeEach(() => m.kv.clear());

describe("kanaalToegang", () => {
  it("een medewerker mag het team en zijn eigen gesprek, niet dat van een collega of iets verzonnens", () => {
    expect(kanaalToegang(KANAAL_TEAM, "m1")).toBe(true);
    expect(kanaalToegang(dmKanaal("m1"), "m1")).toBe(true);
    expect(kanaalToegang(dmKanaal("m2"), "m1")).toBe(false);
    expect(kanaalToegang("dm-", "m1")).toBe(false);
    expect(kanaalToegang("dm-m1/../x", null)).toBe(false);
    expect(kanaalToegang("iets", "m1")).toBe(false);
  });

  it("de beheerder (geen medewerkerId) mag elk geldig kanaal, maar ook hij geen verzonnen naam", () => {
    expect(kanaalToegang(KANAAL_TEAM, null)).toBe(true);
    expect(kanaalToegang(dmKanaal("m2"), null)).toBe(true);
    expect(kanaalToegang("../../x", null)).toBe(false);
  });
});

describe("berichten", () => {
  it("plaatst met naam en tijd en houdt de volgorde", async () => {
    await plaatsBericht(T, KANAAL_TEAM, { id: "m1", naam: "Piet" }, " hoi allemaal ", new Date("2026-11-15T10:00:00Z"));
    await plaatsBericht(T, KANAAL_TEAM, { id: "beheer", naam: "Els" }, "welkom", new Date("2026-11-15T10:05:00Z"));
    const l = await berichtenVan(T, KANAAL_TEAM);
    expect(l.map((b) => [b.van, b.tekst])).toEqual([["m1", "hoi allemaal"], ["beheer", "welkom"]]);
    expect(l[0]?.op).toBe("2026-11-15T10:00:00.000Z");
  });

  it("weigert een leeg of te lang bericht", async () => {
    await expect(plaatsBericht(T, KANAAL_TEAM, { id: "m1", naam: "P" }, "   ")).rejects.toThrow(/Schrijf/);
    await expect(plaatsBericht(T, KANAAL_TEAM, { id: "m1", naam: "P" }, "x".repeat(MAX_BERICHT + 1))).rejects.toThrow(/tekens/);
  });

  it("bewaart hooguit de laatste berichten", async () => {
    for (let i = 0; i < BEWAAR_BERICHTEN + 5; i += 1) await plaatsBericht(T, KANAAL_TEAM, { id: "m1", naam: "P" }, `n${i}`);
    const l = await berichtenVan(T, KANAAL_TEAM);
    expect(l).toHaveLength(BEWAAR_BERICHTEN);
    expect(l[l.length - 1]?.tekst).toBe(`n${BEWAAR_BERICHTEN + 4}`);
  });

  it("kanalen en bedrijven staan los van elkaar", async () => {
    await plaatsBericht(T, KANAAL_TEAM, { id: "m1", naam: "P" }, "team");
    await plaatsBericht(T, dmKanaal("m1"), { id: "m1", naam: "P" }, "prive");
    expect((await berichtenVan(T, KANAAL_TEAM)).map((b) => b.tekst)).toEqual(["team"]);
    expect((await berichtenVan(T, dmKanaal("m1"))).map((b) => b.tekst)).toEqual(["prive"]);
    expect(await berichtenVan("tenantBBBB2", KANAAL_TEAM)).toEqual([]);
  });

  it("een bericht weghalen laat de rest staan; een onbekend id doet niets", async () => {
    const a = await plaatsBericht(T, KANAAL_TEAM, { id: "m1", naam: "P" }, "een");
    await plaatsBericht(T, KANAAL_TEAM, { id: "m1", naam: "P" }, "twee");
    await verwijderBericht(T, KANAAL_TEAM, a.id);
    await verwijderBericht(T, KANAAL_TEAM, "bestaatniet");
    expect((await berichtenVan(T, KANAAL_TEAM)).map((b) => b.tekst)).toEqual(["twee"]);
  });
});
