import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "@/lib/security/csp";

const script = (pathname: string) => buildContentSecurityPolicy({ dev: false, nonce: "N", pathname }).split("; ").find((d) => d.startsWith("script-src")) ?? "";

describe("CSP en WebAssembly voor de paskamer", () => {
  it("alle /shop-pagina's mogen WebAssembly draaien (de foto wordt op het toestel gemeten), nooit eval van JavaScript", () => {
    for (const p of ["/shop", "/shop/paskamer", "/shop/zakelijk", "/shop/veiligheidshesje"]) {
      const s = script(p);
      expect(s, p).toContain("'wasm-unsafe-eval'");
      expect(s, p).not.toMatch(/'unsafe-eval'/);
      expect(s, p).toContain("'strict-dynamic'");
    }
  });

  it("andere pagina's houden de strenge regel", () => {
    for (const p of ["/", "/werkgever", "/shopping", "/api/x"]) expect(script(p), p).not.toContain("wasm-unsafe-eval");
  });
});
