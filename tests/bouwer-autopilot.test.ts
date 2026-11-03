import { describe, expect, it } from "vitest";
import { kiesFout } from "@/lib/bouwer/autopilot";
import { standaardBouwerModel } from "@/lib/bouwer/werker";
import type { ErrorGroup } from "@/lib/ops/error-journal";

const NU = Date.parse("2026-11-03T12:00:00Z");
const uurGeleden = (u: number) => new Date(NU - u * 3600_000).toISOString();

const groep = (over: Partial<ErrorGroup> = {}): ErrorGroup => ({
  id: "0123456789abcdef",
  level: "error",
  message: "request failed",
  reason: "Cannot read properties of undefined",
  route: "GET /api/shifts/[id]",
  count: 5,
  firstAt: uurGeleden(30),
  lastAt: uurGeleden(1),
  samples: [],
  ...over,
});

describe("Bouwer-autopilot: welke fout pakt hij op", () => {
  it("kiest de vaakst terugkerende recente fout", () => {
    const a = groep({ id: "aaaaaaaaaaaaaaaa", count: 4 });
    const b = groep({ id: "bbbbbbbbbbbbbbbb", count: 9 });
    expect(kiesFout([a, b], {}, NU)?.id).toBe("bbbbbbbbbbbbbbbb");
  });

  it("laat eenmalige fouten, waarschuwingen, oude fouten en bezoekerstekst liggen", () => {
    expect(kiesFout([groep({ count: 2 })], {}, NU)).toBeNull();
    expect(kiesFout([groep({ level: "warn" })], {}, NU)).toBeNull();
    expect(kiesFout([groep({ lastAt: uurGeleden(30) })], {}, NU)).toBeNull();
    expect(kiesFout([groep({ message: "client error boundary" })], {}, NU)).toBeNull();
    expect(kiesFout([groep({ id: "overloop" })], {}, NU)).toBeNull();
  });

  it("probeert dezelfde fout pas na 7 dagen opnieuw", () => {
    const g = groep();
    expect(kiesFout([g], { [g.id]: uurGeleden(24) }, NU)).toBeNull();
    expect(kiesFout([g], { [g.id]: uurGeleden(8 * 24) }, NU)?.id).toBe(g.id);
  });
});

describe("standaardmodel van de Bouwer", () => {
  const GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai";
  it("neemt bij Gemini niet de lichte flash-lite", () => {
    expect(standaardBouwerModel("", "gemini-3.5-flash-lite", GEMINI)).toBe("gemini-3.5-flash");
    expect(standaardBouwerModel("gemini-3.5-flash-lite", "gemini-3.5-flash-lite", GEMINI)).toBe("gemini-3.5-flash");
  });
  it("respecteert een gekozen code-model en andere aanbieders", () => {
    expect(standaardBouwerModel("gemini-3.1-pro-preview", "gemini-3.5-flash-lite", GEMINI)).toBe("gemini-3.1-pro-preview");
    expect(standaardBouwerModel("", "qwen2.5-coder:7b", "http://ollama:11434/v1")).toBe("qwen2.5-coder:7b");
  });
});
