import { readFileSync } from "node:fs";
import path from "node:path";
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

  it("elke /shop-pagina gaat naar de voorpagina", () => {
    const layout = lees("app/shop/layout.tsx");
    expect(layout).toContain('if (!WEBSHOP_AAN) redirect("/");');
    expect(layout.indexOf('redirect("/")')).toBeLessThan(layout.indexOf("await getLocale()"));
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
    expect(todos).toContain("return WEBSHOP_AAN ? lijst : lijst.filter((t) => !WEBSHOP_TAKEN.has(t.id));");
    for (const id of ["webshop-leverancier", "product-photos", "3d-models", "stripe-agentische-handel"]) expect(todos).toContain(`id: "${id}"`);
  });
});
