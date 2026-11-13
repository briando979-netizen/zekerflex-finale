import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Beheer -> Kosten: het Gemini-verbruik van deze kalendermaand uit AiUsageLog (aanroepen en tokens, geen prijs, geen inhoud).

const h = vi.hoisted(() => ({
  groupBy: vi.fn(async (_args: unknown): Promise<unknown[]> => []),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { aiUsageLog: { groupBy: h.groupBy } } }));

import {
  NIET_TE_LEZEN,
  TELT_VANAF,
  VANAF_NOTITIE,
  geminiStand,
  isGemini,
  maandGrenzen,
  samenvatGemini,
  telGrenzen,
  verbruikRegel,
  type VerbruikGroep,
} from "@/lib/admin/gemini-verbruik";
import { geminiVerbruikDezeMaand } from "@/lib/admin/gemini-verbruik-lezen";

const groep = (o: Partial<VerbruikGroep> = {}): VerbruikGroep => ({
  model: "gemini-2.0-flash",
  endpointHost: "generativelanguage.googleapis.com",
  aanroepen: 10,
  promptTokens: 100,
  completionTokens: 50,
  totalTokens: 150,
  ...o,
});

beforeEach(() => {
  (globalThis as { __zfGeminiVerbruik?: unknown }).__zfGeminiVerbruik = undefined;
  h.groupBy.mockReset();
  h.groupBy.mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

describe("de maandgrens op Amsterdamse tijd", () => {
  it("een gewone dag: van het begin van de maand (Amsterdam) tot het begin van de volgende", () => {
    const { van, tot, label } = maandGrenzen(new Date("2026-11-14T10:00:00+01:00"));
    expect(van.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(tot.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(label).toBe("november 2026");
  });

  it("vlak voor middernacht UTC op de laatste dag is het in Amsterdam al de volgende maand", () => {
    const { van, label } = maandGrenzen(new Date("2026-11-30T23:30:00Z"));
    expect(van.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(label).toBe("december 2026");
  });

  it("een maand waarin de zomertijd eindigt (25 okt 2026): de grenzen volgen de Amsterdamse klok", () => {
    const { van, tot, label } = maandGrenzen(new Date("2026-10-31T22:30:00Z"));
    expect(van.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(tot.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(label).toBe("oktober 2026");
  });
});

describe("alleen Gemini", () => {
  it("herkent een echte Gemini-aanroep aan de host van Google, niet meer aan de modelnaam (13 nov); andere aanbieders niet", () => {
    expect(isGemini({ model: "gemini-2.0-flash", endpointHost: "generativelanguage.googleapis.com" })).toBe(true);
    expect(isGemini({ model: "iets", endpointHost: "generativelanguage.googleapis.com" })).toBe(true);
    // vóór de reparatie heette een mislukte aanroep naar ons eigen model "gemini-..."; nu staat daar de echte host
    expect(isGemini({ model: "gemini-2.0-flash", endpointHost: "local" })).toBe(false);
    expect(isGemini({ model: "iets", endpointHost: "googleapis.com.example" })).toBe(false);
    expect(isGemini({ model: "gemma3:4b", endpointHost: "ollama" })).toBe(false);
    expect(isGemini({ model: "qwen2.5:3b", endpointHost: "local" })).toBe(false);
  });

  it("telt per model op en laat andere hosts weg, ook met een Gemini-naam", () => {
    const v = samenvatGemini([
      groep({ aanroepen: 10, promptTokens: 100, completionTokens: 50, totalTokens: 150 }),
      groep({ endpointHost: "andere-host", aanroepen: 5, promptTokens: 40, completionTokens: 10, totalTokens: 50 }),
      groep({ model: "gemini-pro", aanroepen: 2, promptTokens: 7, completionTokens: 3, totalTokens: 0 }),
      groep({ model: "gemma3:4b", endpointHost: "ollama", aanroepen: 99, promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
    ]);
    expect(v.aanroepen).toBe(12);
    // totalTokens is leidend; zonder totaal telt invoer plus uitvoer
    expect(v.tokens).toBe(150 + 10);
    expect(v.perModel).toEqual([
      { model: "gemini-2.0-flash", aanroepen: 10, tokens: 150 },
      { model: "gemini-pro", aanroepen: 2, tokens: 10 },
    ]);
  });

  it("nul rijen is 'nog geen verbruik', zonder verzonnen bedrag", () => {
    const v = samenvatGemini([]);
    expect(v).toEqual({ aanroepen: 0, tokens: 0, perModel: [] });
    expect(verbruikRegel(v)).toBe("Gemini-verbruik deze maand: nog geen verbruik; bedrag: zie Google Cloud.");
    expect(verbruikRegel(samenvatGemini([groep({ model: "gemma3:4b", endpointHost: "ollama" })]))).toContain("nog geen verbruik");
  });

  it("de regel noemt aanroepen en tokens en verwijst voor het bedrag naar Google Cloud", () => {
    const regel = verbruikRegel({ aanroepen: 1234, tokens: 5_678_901, perModel: [] });
    expect(regel).toBe("Gemini-verbruik deze maand: 1.234 aanroepen, 5.678.901 tokens; bedrag: zie Google Cloud.");
    expect(regel).not.toMatch(/€|\$|EUR/);
  });

  it("geminiStand geeft de maand van de klok mee, en in november 2026 de notitie vanaf wanneer hij telt", () => {
    const s = geminiStand([groep()], new Date("2026-11-14T10:00:00+01:00"));
    expect(s.ok && s.maand).toBe("november 2026");
    expect(s.ok && s.notitie).toBe("Telt vanaf 14 november 2026; eerdere regels in het logboek noemden een verkeerde server.");
    const dec = geminiStand([], new Date("2026-12-10T10:00:00+01:00"));
    expect(dec.ok && dec.notitie).toBeNull();
  });
});

describe("vanaf de reparatie van de host in AiUsageLog (13 nov 2026)", () => {
  it("telt niets van vóór het begin van 14 nov 2026 (Amsterdamse tijd): die rijen hadden een verkeerde host", () => {
    expect(TELT_VANAF.toISOString()).toBe("2026-11-13T23:00:00.000Z");
    const nov = telGrenzen(new Date("2026-11-14T10:00:00+01:00"));
    expect(nov.van.toISOString()).toBe("2026-11-13T23:00:00.000Z");
    expect(nov.tot.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(nov.notitie).toBe(VANAF_NOTITIE);
  });

  it("vanaf december gewoon de hele maand, zonder notitie", () => {
    const dec = telGrenzen(new Date("2026-12-10T10:00:00+01:00"));
    expect(dec.van.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(dec.tot.toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect(dec.notitie).toBeNull();
  });
});

describe("het lezen uit AiUsageLog", () => {
  const NU = new Date("2026-11-14T10:00:00+01:00");

  it("één kleine groupBy vanaf TELT_VANAF, alleen sommen, alleen de host van Google", async () => {
    h.groupBy.mockResolvedValue([{ model: "gemini-2.0-flash", endpointHost: "generativelanguage.googleapis.com", _count: { _all: 3 }, _sum: { promptTokens: 30, completionTokens: 20, totalTokens: 50 } }]);
    const s = await geminiVerbruikDezeMaand(NU);
    expect(s.ok && s.verbruik.aanroepen).toBe(3);
    expect(s.ok && s.verbruik.tokens).toBe(50);
    expect(h.groupBy).toHaveBeenCalledTimes(1);
    const arg = h.groupBy.mock.calls[0]?.[0] as { by: string[]; where: Record<string, unknown> & { createdAt: { gte: Date; lt: Date } }; _sum: Record<string, boolean> };
    expect(arg.by).toEqual(["model", "endpointHost"]);
    // november 2026 telt pas vanaf de reparatie, niet vanaf 1 november
    expect(arg.where.createdAt.gte.toISOString()).toBe("2026-11-13T23:00:00.000Z");
    expect(arg.where.endpointHost).toEqual({ endsWith: "googleapis.com" });
    expect(Object.keys(arg.where).sort()).toEqual(["createdAt", "endpointHost"]);
    expect(arg.where.createdAt.lt.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(Object.keys(arg._sum)).toEqual(["promptTokens", "completionTokens", "totalTokens"]);
  });

  it("een som die null is (geen tokens opgegeven) telt als nul", async () => {
    h.groupBy.mockResolvedValue([{ model: "gemini-2.0-flash", endpointHost: "generativelanguage.googleapis.com", _count: { _all: 2 }, _sum: { promptTokens: null, completionTokens: null, totalTokens: null } }]);
    const s = await geminiVerbruikDezeMaand(NU);
    expect(s.ok && s.verbruik).toEqual({ aanroepen: 2, tokens: 0, perModel: [{ model: "gemini-2.0-flash", aanroepen: 2, tokens: 0 }] });
  });

  it("hooguit een keer per uur: de tweede aanroep komt uit het geheugen, na een uur opnieuw", async () => {
    await geminiVerbruikDezeMaand(NU);
    await geminiVerbruikDezeMaand(new Date(NU.getTime() + 30 * 60_000));
    expect(h.groupBy).toHaveBeenCalledTimes(1);
    await geminiVerbruikDezeMaand(new Date(NU.getTime() + 61 * 60_000));
    expect(h.groupBy).toHaveBeenCalledTimes(2);
  });

  it("een nieuwe maand gebruikt de cache van de vorige niet", async () => {
    await geminiVerbruikDezeMaand(new Date("2026-11-30T22:00:00Z"));
    await geminiVerbruikDezeMaand(new Date("2026-11-30T23:10:00Z"));
    expect(h.groupBy).toHaveBeenCalledTimes(2);
  });

  it("bij een leesfout: 'verbruik nu niet te lezen', zonder details en zonder dat de pagina breekt", async () => {
    h.groupBy.mockRejectedValue(new Error("connection refused postgres://gebruiker:wachtwoord@host"));
    const s = await geminiVerbruikDezeMaand(NU);
    expect(s).toEqual({ ok: false, melding: NIET_TE_LEZEN });
    expect(JSON.stringify(s)).not.toContain("wachtwoord");
  });

  it("zonder rijen: nog geen verbruik", async () => {
    const s = await geminiVerbruikDezeMaand(NU);
    expect(s.ok && s.regel).toContain("nog geen verbruik");
  });
});
