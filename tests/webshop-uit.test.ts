import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { WEBSHOP_AAN } from "@/lib/shop/aan";

// 21 nov 2026 (eigenaar): "de webshop en alles eromheen is niet meer nodig en kan weg". Eén schakelaar (lib/shop/aan.ts):
// /shop naar de voorpagina, de taken van de webshop (CJ, voorraadmelding, productlijst voor AI-assistenten) doen niets meer
// (de CJ-ronde gaf duizenden foutmeldingen per dag), en de webshoptaken staan niet meer in Beheer → Te doen. De code blijft.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("de webshop staat uit", () => {
  it("de schakelaar staat uit", () => {
    expect(WEBSHOP_AAN).toBe(false);
  });

  // 22 nov 2026: de shoppagina's zijn weg; next.config.mjs stuurt /shop en de oude shopadressen door naar de voorpagina.
  // De foto's in public/shop en de partnerlink /shop/p/<code> (de studio deelt hem) blijven gewoon werken.
  it("elke /shop-pagina gaat naar de voorpagina", async () => {
    expect(existsSync(path.join(process.cwd(), "app/shop/page.tsx"))).toBe(false);
    expect(existsSync(path.join(process.cwd(), "app/shop/layout.tsx"))).toBe(false);
    type Regel = { source: string; destination: string; permanent: boolean };
    const mod = (await import(pathToFileURL(path.join(process.cwd(), "next.config.mjs")).href)) as { default: { redirects: () => Promise<Regel[]> } };
    const regels = await mod.default.redirects();
    for (const bron of ["/shop", "/shop/:slug([^./]+)", "/shop/bestelling/:id"]) {
      const r = regels.find((x) => x.source === bron);
      expect(r, bron).toBeDefined();
      expect(r?.destination, bron).toBe("/");
      expect(r?.permanent, bron).toBe(false);
    }
    expect(existsSync(path.join(process.cwd(), "app/shop/p/[code]/route.ts"))).toBe(true);
  });

  it("de taken van de webshop doen niets meer, maar houden hun hartslag", () => {
    for (const r of ["agent-catalogus", "voorraadmelding", "cj-bijwerken", "cj-fotos-verhuizen", "cj-volgen", "cj-wachtrij"]) {
      const src = lees(`app/api/internal/shop/${r}/route.ts`);
      expect(src, r).toContain("if (!WEBSHOP_AAN) {");
      expect(src, r).toContain(`recordCronRun("${r}", true);`);
      // na de toegangscontrole, vóór het echte werk
      expect(src.indexOf("checkInternalToken(request)"), r).toBeLessThan(src.indexOf("if (!WEBSHOP_AAN)"));
      expect(src.indexOf("if (!WEBSHOP_AAN)"), r).toBeLessThan(src.indexOf("try {"));
    }
  });

  it("de webshoptaken van de eigenaar vallen weg", () => {
    const todos = lees("lib/admin/owner-todos.ts");
    expect(todos).toContain("(WEBSHOP_AAN || !WEBSHOP_TAKEN.has(t.id))");
    for (const id of ["webshop-leverancier", "product-photos", "3d-models", "stripe-agentische-handel"]) expect(todos).toContain(`id: "${id}"`);
  });
});
