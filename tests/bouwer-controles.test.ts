import { describe, expect, it } from "vitest";
import { controleTekst, duurKort, faaltOp } from "@/lib/bouwer/controles-tekst";

// De controle vóór het live zetten (lib/bouwer/controles-tekst.ts): de teksten voor Admin.

describe("faaltOp", () => {
  it("noemt de onderdelen die faalden, in vaste volgorde", () => {
    expect(faaltOp({ tsc: true, eslint: true, tests: true })).toEqual([]);
    expect(faaltOp({ tsc: false, eslint: true, tests: false })).toEqual(["TypeScript", "de tests"]);
  });
});

describe("duurKort", () => {
  it("seconden onder een minuut, daarna minuten", () => {
    expect(duurKort(45)).toBe("45 s");
    expect(duurKort(60)).toBe("1 min");
    expect(duurKort(250)).toBe("4 min");
  });
});

describe("controleTekst", () => {
  it("schoon met de duur", () => {
    expect(controleTekst({ ok: true, tsc: true, eslint: true, tests: true, duurSec: 212 })).toBe("schoon in 4 min");
  });

  it("faalt met de onderdelen in gewone taal", () => {
    expect(controleTekst({ ok: false, tsc: false, eslint: true, tests: true, duurSec: 30 })).toBe("faalt op TypeScript (30 s)");
    expect(controleTekst({ ok: false, tsc: false, eslint: false, tests: false, duurSec: 400 })).toBe("faalt op TypeScript, eslint en de tests (7 min)");
  });
});
