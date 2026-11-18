import { describe, expect, it } from "vitest";
import { WACHTRIJ_PER_PAGINA, metPagina, metProduct, nieuweWachtrij, schatting, volgendeStap, voortgang, wachtrijTekst } from "@/lib/shop/cj/wachtrij-core";

// "Alles overnemen" via een wachtrij (18 nov 2026): pagina's van 50, product voor product, tellers en een eerlijke schatting.

const NU = new Date("2026-11-18T05:00:00Z");
const pids = (n: number, van = 0) => Array.from({ length: n }, (_, i) => `P${van + i}`);

describe("de wachtrij", () => {
  it("start met de eerste pagina en weet of er meer pagina's zijn", () => {
    const w = nieuweWachtrij({ q: "toys", getypt: "speelgoed", land: "DE", categorie: null, actief: true, totaal: 758, eerstePagina: pids(50), now: NU });
    expect(w.status).toBe("loopt");
    expect(w.buffer).toHaveLength(50);
    expect(w.paginaVolgende).toBe(2);
    expect(w.paginaKlaar).toBe(false);
    expect(volgendeStap(w)).toBe("product");
    const klein = nieuweWachtrij({ q: "x", getypt: "x", land: "", categorie: "Speelgoed", actief: false, totaal: 12, eerstePagina: pids(12), now: NU });
    expect(klein.paginaKlaar).toBe(true);
    expect(nieuweWachtrij({ q: "x", getypt: "x", land: "", categorie: null, actief: false, totaal: 0, eerstePagina: [], now: NU }).status).toBe("klaar");
  });

  it("na de buffer komt de volgende pagina, zonder dubbele; de laatste pagina sluit af", () => {
    let w = nieuweWachtrij({ q: "toys", getypt: "speelgoed", land: "DE", categorie: null, actief: true, totaal: 120, eerstePagina: pids(50), now: NU });
    for (const p of pids(50)) w = metProduct(w, p, "gedaan");
    expect(volgendeStap(w)).toBe("pagina");
    w = metPagina(w, [...pids(50, 50), "P60"], NU);
    expect(w.buffer).toHaveLength(50);
    expect(w.paginaVolgende).toBe(3);
    expect(w.paginaKlaar).toBe(false);
    for (const p of w.buffer) w = metProduct(w, p, "gedaan");
    w = metPagina(w, pids(20, 100), NU);
    expect(w.paginaKlaar).toBe(true);
    for (const p of w.buffer) w = metProduct(w, p, "bestaand");
    expect(w.status).toBe("klaar");
    expect(volgendeStap(w)).toBe("wacht");
    expect(voortgang(w)).toEqual({ afgehandeld: 120, rest: 0, procent: 100 });
  });

  it("telt goed, bestaand, mislukt en nog te vertalen; bewaart de laatste 20 fouten", () => {
    let w = nieuweWachtrij({ q: "toys", getypt: "speelgoed", land: "DE", categorie: null, actief: true, totaal: 50, eerstePagina: pids(50), now: NU });
    w = metProduct(w, "P0", "gedaan");
    w = metProduct(w, "P1", "bestaand");
    w = metProduct(w, "P2", "nogTeVertalen");
    for (let i = 3; i < 28; i++) w = metProduct(w, `P${i}`, "mislukt", `fout ${i}`);
    expect(w).toMatchObject({ gedaan: 2, bestaand: 1, mislukt: 25, nogTeVertalen: 1 });
    expect(w.fouten).toHaveLength(20);
    expect(w.fouten[0]!.pid).toBe("P8");
    expect(w.buffer).toHaveLength(22);
    expect(voortgang(w)).toEqual({ afgehandeld: 28, rest: 22, procent: 56 });
    expect(wachtrijTekst(w)).toBe("28 van 50 gedaan, loopt");
  });

  it("pauze en stop houden het werk tegen; de schatting rekent met het tempo van de cron", () => {
    const w = nieuweWachtrij({ q: "toys", getypt: "speelgoed", land: "DE", categorie: null, actief: true, totaal: 758, eerstePagina: pids(WACHTRIJ_PER_PAGINA), now: NU });
    expect(volgendeStap({ ...w, status: "pauze" })).toBe("wacht");
    expect(volgendeStap({ ...w, status: "gestopt" })).toBe("wacht");
    const s = schatting(w);
    // 758 × 30 s (4 per 2 minuten) ≈ 6,3 uur
    expect(s.seconden).toBe(758 * 30);
    expect(s.tekst).toBe("ongeveer 6 uur en 19 minuten");
    expect(schatting({ ...w, status: "pauze" }).tekst).toBe("");
    expect(wachtrijTekst({ ...w, status: "pauze" })).toBe("0 van 758 gedaan, op pauze");
  });
});
