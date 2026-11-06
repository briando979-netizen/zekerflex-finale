import { describe, expect, it } from "vitest";
import { isTaal } from "@/lib/ontwerp/paginas";

// Een taalcode uit de URL (/p/<slug>/<taal>) mag nooit een eigenschap van het Object-prototype zijn.
describe("isTaal", () => {
  it("kent de echte talen en weigert prototype-namen", () => {
    expect(isTaal("en")).toBe(true);
    expect(isTaal("uk")).toBe(true);
    expect(isTaal("constructor")).toBe(false);
    expect(isTaal("__proto__")).toBe(false);
    expect(isTaal("toString")).toBe(false);
    expect(isTaal("xx")).toBe(false);
    expect(isTaal(1)).toBe(false);
  });
});
