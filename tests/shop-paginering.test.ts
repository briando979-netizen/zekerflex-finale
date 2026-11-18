import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SHOP_PER_PAGINA, paginaAdres, paginaUitAdres, paginaVenster } from "@/lib/shop/paginering";

// Paginering van het assortiment (18 nov 2026): 48 kaarten per pagina, "Toon meer" in de browser, ?pagina=N als echte link.
// Na de CJ-import stonden er 566 kaarten op /shop (3,0 MB HTML, 573 afbeeldingen, 120.000 px hoog op een telefoon).

describe("paginering van het assortiment", () => {
  it("leest ?pagina= soepel: heel getal vanaf 1, anders 1, met een plafond", () => {
    expect(paginaUitAdres("2")).toBe(2);
    expect(paginaUitAdres("0")).toBe(1);
    expect(paginaUitAdres("-3")).toBe(1);
    expect(paginaUitAdres("abc")).toBe(1);
    expect(paginaUitAdres(undefined)).toBe(1);
    expect(paginaUitAdres("99999")).toBe(500);
  });

  it("geeft per pagina 48 kaarten, kapt af op de laatste pagina en telt wat Toon meer erbij laadde", () => {
    expect(SHOP_PER_PAGINA).toBe(48);
    expect(paginaVenster(566, 1)).toEqual({ pagina: 1, totaalPaginas: 12, van: 0, tot: 48 });
    expect(paginaVenster(566, 2)).toEqual({ pagina: 2, totaalPaginas: 12, van: 48, tot: 96 });
    expect(paginaVenster(566, 12)).toEqual({ pagina: 12, totaalPaginas: 12, van: 528, tot: 566 });
    expect(paginaVenster(566, 40)).toEqual({ pagina: 12, totaalPaginas: 12, van: 528, tot: 566 });
    expect(paginaVenster(566, 1, 96)).toEqual({ pagina: 1, totaalPaginas: 12, van: 0, tot: 144 });
    expect(paginaVenster(10, 1)).toEqual({ pagina: 1, totaalPaginas: 1, van: 0, tot: 10 });
    expect(paginaVenster(0, 3)).toEqual({ pagina: 1, totaalPaginas: 1, van: 0, tot: 0 });
  });

  it("bouwt echte adressen met dezelfde filters; pagina 1 zonder ?pagina=, lege waarden weg", () => {
    expect(paginaAdres("/shop", { cat: "Elektronica", q: "", voor: null }, 2)).toBe("/shop?cat=Elektronica&pagina=2");
    expect(paginaAdres("/shop", { cat: "Elektronica" }, 1)).toBe("/shop?cat=Elektronica");
    expect(paginaAdres("/shop", {}, 1)).toBe("/shop");
    expect(paginaAdres("/shop", { q: "tuin slang", pagina: "9" }, 3)).toBe("/shop?q=tuin+slang&pagina=3");
  });

  it("de winkelweergave toont een venster van de resultaten en linkt met rel=next/prev; de pagina leest ?pagina=", () => {
    const bron = readFileSync(path.join(process.cwd(), "components/marketing/ShopStorefront.tsx"), "utf8");
    expect(bron).toContain("shown.slice(venster.van, venster.tot)");
    expect(bron).toContain('rel="next"');
    expect(bron).toContain('rel="prev"');
    expect(bron).not.toMatch(/\{shown\.map\(/);
    const pagina = readFileSync(path.join(process.cwd(), "app/shop/page.tsx"), "utf8");
    expect(pagina).toContain("paginaUitAdres(searchParams.pagina)");
    expect(pagina).toContain("initialPagina={initialPagina}");
  });
});
