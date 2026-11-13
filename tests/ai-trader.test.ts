import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALPACA_PAPER_HOST,
  STARTBEDRAG,
  alpacaFoutTekst,
  controleerSleutel,
  dollars,
  isOpen,
  leesOrders,
  leesPosities,
  leesRekening,
  leesVerloop,
  orderStatus,
  procent,
  rendement,
} from "@/lib/trader/alpaca-core";
import { aiTraderTodo } from "@/lib/admin/todo-ai-trader";
import { ADMIN_HUBS } from "@/lib/admin/nav";
import { GRATIS_DIENSTEN } from "@/lib/gratis/diensten";

const lees = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("AI-trader in Beheer: lezen van de Alpaca-papierrekening", () => {
  it("leest de rekening uit tekstgetallen en weigert een kapot antwoord", () => {
    expect(leesRekening({ status: "ACTIVE", cash: "100000", equity: "100000", last_equity: "99000" })).toEqual({ status: "ACTIVE", cash: 100000, vermogen: 100000, vorigVermogen: 99000 });
    expect(leesRekening({ cash: "x", equity: "1" })).toBeNull();
    expect(leesRekening(null)).toBeNull();
  });

  it("leest posities, orders en het verloop; onbruikbare regels vallen weg", () => {
    expect(leesPosities([{ symbol: "SPY", qty: "32", market_value: "24227.84", current_price: "757.12", avg_entry_price: "750", unrealized_pl: "10" }, { qty: "1" }, "rommel"])).toEqual([
      { symbool: "SPY", aantal: 32, waarde: 24227.84, koers: 757.12, instap: 750, resultaat: 10 },
    ]);
    const orders = leesOrders([{ id: "a", symbol: "QQQ", side: "buy", qty: "35", filled_qty: "0", status: "new", submitted_at: "2026-11-13T08:00:00Z" }, { symbol: "x" }]);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ kant: "kopen", aantal: 35, prijs: null, status: "new" });
    const v = leesVerloop({ timestamp: [1762992000, 1763078400, 5], equity: [100000, null, 100500] });
    expect(v.vermogen).toEqual([100000, 100500]);
    expect(v.tijden).toHaveLength(2);
  });

  it("rendement en teksten in gewoon Nederlands", () => {
    expect(rendement(101000)).toBeCloseTo(0.01);
    expect(rendement(STARTBEDRAG)).toBe(0);
    expect(procent(0.0123)).toBe("+1,23%");
    expect(procent(-0.05)).toBe("-5,00%");
    expect(dollars(100000)).toBe("$ 100.000,00");
    expect(dollars(-1234.5)).toBe("-$ 1.234,50");
  });

  it("een nieuwe order wacht op de beurs, een uitgevoerde is af, een afgewezen is rood", () => {
    expect(orderStatus("new").tekst).toMatch(/Wacht op de opening van de beurs/);
    expect(orderStatus("accepted").toon).toBe("warn");
    expect(orderStatus("filled")).toEqual({ tekst: "Uitgevoerd", toon: "ok" });
    expect(orderStatus("rejected").toon).toBe("crit");
    expect(isOpen("new")).toBe(true);
    expect(isOpen("filled")).toBe(false);
  });

  it("toont fouten van Alpaca eerlijk", () => {
    expect(alpacaFoutTekst(401)).toMatch(/weigert de sleutel/);
    expect(alpacaFoutTekst(429)).toMatch(/te vaak/);
    expect(alpacaFoutTekst(418)).toContain("418");
  });

  it("accepteert alleen een papier-sleutel (PK), nooit een echte (AK)", () => {
    expect(controleerSleutel("PKABCDEFGHIJKL", "a".repeat(40))).toBeNull();
    expect(controleerSleutel("AKABCDEFGHIJKL", "a".repeat(40))).toMatch(/echte rekening/);
    expect(controleerSleutel("", "")).toMatch(/Vul/);
    expect(controleerSleutel("PKABCDEFGHIJKL", "kort")).toMatch(/geheim/);
  });
});

describe("AI-trader: alleen lezen, alleen de papier-host", () => {
  const bron = lees("lib/trader/alpaca.ts");
  const kern = lees("lib/trader/alpaca-core.ts");

  it("doet alleen GET en noemt geen order-, POST- of DELETE-aanroep", () => {
    expect(bron).toContain('method: "GET"');
    expect(bron).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/i);
    expect(bron).not.toMatch(/["']\/v2\/orders["']|\/v2\/orders\/|cancel|replace/i);
    // het enige wat met orders gebeurt, is ze lezen (met een zoekfilter)
    expect(bron).toContain("/v2/orders?status=all");
    expect(kern).not.toMatch(/fetch\(/);
  });

  it("noemt alleen de papier-host en nergens de echte API", () => {
    expect(ALPACA_PAPER_HOST).toBe("paper-api.alpaca.markets");
    const alles = bron + kern + lees("app/api/admin/ai-trader/route.ts") + lees("app/admin/ai-trader/page.tsx");
    expect(alles).not.toMatch(/(^|[^-\w])api\.alpaca\.markets/);
    expect([...alles.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map((m) => m[0]).filter((h) => !h.includes("paper-api.alpaca.markets") && !h.includes("app.alpaca"))).toEqual([]);
  });

  it("de sleutel wordt verzegeld bewaard en nooit gelogd of teruggegeven", () => {
    expect(bron).toContain("sealSecret(s.id");
    expect(bron).toContain("sealSecret(s.geheim");
    expect(bron).not.toMatch(/logger\.|console\./);
    const route = lees("app/api/admin/ai-trader/route.ts");
    expect(route).not.toMatch(/logger\.|console\./);
    expect(route).toContain('["PLATFORM_ADMIN"]');
    expect(lees("app/admin/ai-trader/page.tsx")).toContain('hasRole(principal, "PLATFORM_ADMIN")');
  });

  it("staat in het menu, in de lijst van diensten en als taak voor de eigenaar", () => {
    expect(ADMIN_HUBS.flatMap((h) => h.pages.map((p) => p.href))).toContain("/admin/ai-trader");
    expect(GRATIS_DIENSTEN.some((d) => d.hosts?.includes("paper-api.alpaca.markets"))).toBe(true);
    expect(aiTraderTodo(false)).toMatchObject({ id: "ai-trader-sleutel", done: false });
    expect(aiTraderTodo(false)?.title).toBe("Alpaca-papiersleutel invullen bij Beheer → AI-trader");
    expect(aiTraderTodo(true)?.done).toBe(true);
    expect(aiTraderTodo(undefined)).toBeNull();
  });

  it("de pagina zegt dat het papier is en toont nog geen handelsdag eerlijk", () => {
    const pagina = lees("app/admin/ai-trader/page.tsx");
    expect(pagina).toContain("papier, met nep-geld");
    expect(pagina).toContain("Nog geen handelsdag");
    expect(pagina).toContain("Nog geen sleutel ingevuld");
    expect(pagina).not.toMatch(/<button|onClick/);
  });
});