import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CITIES, cityBySlug } from "@/lib/seo-cities";
import { CBS_TABELLEN, NEDERLAND_CIJFERS, STAD_CIJFERS } from "@/lib/seo-stad-cijfers.generated";
import {
  aantalVraag,
  bronUrl,
  burenVraag,
  cijferBlok,
  dichtbij,
  gemeenteVan,
  getal,
  komma,
  matenVoor,
  opsomming,
  stadCijfers,
  studentenVraag,
} from "@/lib/seo-stad";
import { SECTORS } from "@/lib/seo-sectors";

// De CBS-cijfers per stad (22 nov 2026): gemaakt door scripts/stad-cijfers.mjs, gecommit, op runtime niets ophalen. Elke
// stad uit lib/seo-cities.ts heeft cijfers met een bron (tabel) en peiljaar, de plaatsen die onder een grotere gemeente
// vallen noemen die gemeente, en de getallen kloppen met elkaar (deel ≤ geheel, stad < Nederland).

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
const stad = (slug: string) => cityBySlug(slug)!;

describe("de cijfers per stad", () => {
  it("elke stad heeft cijfers, en er staan geen steden in die niet op de site staan", () => {
    expect(Object.keys(STAD_CIJFERS).sort()).toEqual(CITIES.map((c) => c.slug).sort());
  });

  it("elk cijfer heeft een tabel die bekend is en een peiljaar, en de getallen kloppen met elkaar", () => {
    for (const [slug, k] of Object.entries(STAD_CIJFERS)) {
      const alle = [k.inwoners, k.jongeren, ...Object.values(k.vestigingen), ...Object.values(k.vestigingenVorig), ...Object.values(k.regio)];
      for (const c of alle) {
        expect(Object.hasOwn(CBS_TABELLEN, c.tabel), `${slug} ${c.tabel}`).toBe(true);
        expect(c.jaar, slug).toBeGreaterThanOrEqual(2024);
        expect(Number.isInteger(c.n) && c.n > 0, `${slug} ${c.n}`).toBe(true);
      }
      expect(k.jongeren.n).toBeLessThan(k.inwoners.n);
      expect(k.inwoners.n).toBeLessThan(NEDERLAND_CIJFERS.inwoners.n);
      const { totaal, ...takken } = k.vestigingen;
      expect(Object.values(takken).reduce((a, c) => a + c.n, 0), slug).toBeLessThanOrEqual(totaal.n);
      expect(k.vestigingenVorig.totaal.jaar).toBe(k.vestigingen.totaal.jaar - 1);
      for (const [naam, c] of Object.entries(k.regio)) expect(c.n, `${slug} ${naam}`).toBeLessThan(NEDERLAND_CIJFERS.regio[naam as keyof typeof k.regio].n);
      expect(k.gemeenteCode).toMatch(/^GM\d{4}$/);
      expect(k.coropCode).toMatch(/^CR\d{2}$/);
    }
  });

  it("een plaats onder een grotere gemeente noemt die gemeente eerlijk", () => {
    expect(STAD_CIJFERS.hoogezand?.gemeente).toBe("Midden-Groningen");
    expect(STAD_CIJFERS.winschoten?.gemeente).toBe("Oldambt");
    expect(STAD_CIJFERS["den-bosch"]?.gemeente).toBe("'s-Hertogenbosch");
    expect(STAD_CIJFERS["den-haag"]?.gemeente).toBe("'s-Gravenhage");
    expect(gemeenteVan(stad("hoogezand"), stadCijfers("hoogezand")!)).toBe("de gemeente Midden-Groningen, waar Hoogezand-Sappemeer bij hoort");
    expect(gemeenteVan(stad("winschoten"), stadCijfers("winschoten")!)).toBe("de gemeente Oldambt, waar Winschoten bij hoort");
    expect(gemeenteVan(stad("den-haag"), stadCijfers("den-haag")!)).toBe("de gemeente Den Haag (bij het CBS: 's-Gravenhage)");
    expect(gemeenteVan(stad("rotterdam"), stadCijfers("rotterdam")!)).toBe("de gemeente Rotterdam");
    // en in het blok met cijfers staat de gemeente, niet de plaats
    const blok = cijferBlok(stad("hoogezand"), "horeca", "werker", "x", "horecakracht")!;
    expect(blok.alineas.join(" ")).toContain("Midden-Groningen");
    expect(blok.tegels[0]?.label).toBe("inwoners in gemeente Midden-Groningen");
  });

  it("op runtime wordt niets opgehaald; het script haalt bij het CBS en schrijft het bestand", () => {
    for (const f of ["lib/seo-stad.ts", "lib/seo-stad-pagina.ts", "lib/seo-bijbaan.ts", "lib/seo-stad-cijfers.generated.ts"]) {
      expect(lees(f), f).not.toMatch(/\bfetch\(|@\/lib\/prisma|@\/lib\/storage\/kv/);
    }
    const script = lees("scripts/stad-cijfers.mjs");
    expect(script).toContain("https://opendata.cbs.nl/ODataApi/odata");
    expect(script).toContain('"lib", "seo-stad-cijfers.generated.ts"');
    // elke stad van de site staat in het script
    for (const c of CITIES) expect(script, c.slug).toContain(`["${c.slug}", `);
    expect(lees("lib/seo-stad-cijfers.generated.ts")).toMatch(/^\/\/ AUTO-GEGENEREERD door scripts\/stad-cijfers\.mjs/);
    expect(bronUrl("81575NED")).toBe("https://opendata.cbs.nl/statline/#/CBS/nl/dataset/81575NED/table");
  });
});

describe("hulpjes", () => {
  it("getallen zoals in het Nederlands", () => {
    expect(getal(673804)).toBe("673.804");
    expect(getal(950)).toBe("950");
    expect(getal(1601604)).toBe("1.601.604");
    expect(komma(6.248)).toBe("6,2");
    expect(opsomming(["A"])).toBe("A");
    expect(opsomming(["A", "B", "C"])).toBe("A, B en C");
  });

  it("de buren: dichtstbij eerst, zonder de stad zelf, met een afstand die klopt", () => {
    const r = dichtbij(stad("rotterdam"), 6);
    expect(r).toHaveLength(6);
    expect(r.map((b) => b.city.slug)).not.toContain("rotterdam");
    expect(r[0]?.city.slug).toBe("den-haag");
    expect(r[0]?.km).toBeGreaterThan(15);
    expect(r[0]?.km).toBeLessThan(25);
    for (let i = 1; i < r.length; i++) expect(r[i]!.km).toBeGreaterThanOrEqual(r[i - 1]!.km);
    // Veendam en Hoogezand-Sappemeer liggen dicht bij elkaar (de regio van de eigen vestiging)
    expect(dichtbij(stad("veendam"), 2).map((b) => b.city.slug)).toContain("hoogezand");
  });

  it("elke branche (en bijbaan en het algemene overzicht) heeft cijfers, met een cijfer per gemeente om te vergelijken", () => {
    for (const k of [...SECTORS.map((s) => s.key), "bijbaan", "algemeen"]) {
      const maten = matenVoor(k);
      expect(maten.length, k).toBeGreaterThan(0);
      expect(maten.some((m) => m.niveau === "gemeente"), k).toBe(true);
    }
    expect(matenVoor("constructor")).toEqual([]);
  });

  it("het blok met cijfers en de vragen noemen de bron, het jaar en geen verzonnen aantallen", () => {
    for (const c of CITIES) {
      for (const s of SECTORS) {
        const blok = cijferBlok(c, s.key, "werker", "x", s.worker)!;
        expect(blok.bronTekst).toMatch(/^Bron: CBS StatLine, 1 januari 20\d\d/);
        expect(blok.bronnen.map((b) => b.tabel)).toContain("03759ned");
        expect(blok.tegels.length).toBe(3);
        expect(blok.tabel.rijen).toHaveLength(5);
        const tekst = [...blok.alineas, aantalVraag(c, s.key)!.a, burenVraag(c, "werker").a, studentenVraag(c)!.a].join(" ");
        // geen open klussen, werkers of tarieven per stad
        expect(tekst, `${s.key} ${c.slug}`).not.toMatch(/open (klussen|diensten) in|\d+ (werkers|flexwerkers|krachten|klussen|diensten)\b|€\s?\d/i);
      }
    }
  });
});
