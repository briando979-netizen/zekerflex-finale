import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VASTE_PAGINAS, zichtbareSecties } from "@/lib/ontwerp/vaste-paginas";
import { kl, startMarges, werkruimteMarges } from "@/lib/werkgever/start-marges";

// Het startscherm van rijschool, horeca en website indelen (Site-ontwerper, tabblad Pagina's, 13 nov): één indeling voor
// alle drie. Zonder eigen indeling is het scherm precies zoals het was, ook de tussenruimte.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const OUD = ["cijfers", "onderdelen", "concept", "extra", "personeel"];

describe("de standaard is het oude scherm", () => {
  it("dezelfde onderdelen, dezelfde volgorde en dezelfde ruimte erboven", () => {
    expect(VASTE_PAGINAS["werkruimte-start"].secties.map((s) => s.id)).toEqual(OUD);
    expect(zichtbareSecties("werkruimte-start", null)).toEqual(OUD);
    const m = werkruimteMarges(OUD);
    expect(m).toEqual({ cijfers: "", onderdelen: "mt-6", concept: "", extra: "mt-6", personeel: "mt-6" });
    // de klassen komen er precies zo uit als ze in het scherm stonden
    expect(kl(m.cijfers, "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3")).toBe("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3");
    expect(kl(m.onderdelen)).toBe("mt-6");
    expect(kl(m.extra)).toBe("mt-6");
    expect(kl(m.personeel, "flex flex-col")).toBe("mt-6 flex flex-col");
  });

  it("het gewone startscherm houdt zijn eigen ruimte", () => {
    expect(startMarges(["cijfers", "volgers", "beoordelingen", "werk", "berichten", "facturen"]).werk).toBe("mt-8");
  });
});

describe("een eigen indeling", () => {
  it("het bovenste onderdeel sluit aan op de kop, de rest krijgt dezelfde ruimte", () => {
    const m = werkruimteMarges(["extra", "cijfers", "onderdelen", "concept", "personeel"]);
    expect(m.extra).toBe("");
    expect(m.cijfers).toBe("mt-6");
    expect(m.onderdelen).toBe("mt-6");
    expect(kl(m.extra)).toBeUndefined();
  });

  it("de herinnering aan een klus telt niet als bovenste: die staat er meestal niet", () => {
    const m = werkruimteMarges(["concept", "onderdelen", "cijfers"]);
    expect(m.onderdelen).toBe("");
    expect(m.cijfers).toBe("mt-6");
  });

  it("alleen verbergen is ook een eigen indeling", () => {
    const m = werkruimteMarges(["onderdelen", "extra"]);
    expect(m.onderdelen).toBe("");
    expect(m.extra).toBe("mt-6");
  });
});

describe("het scherm", () => {
  const src = bron("components/app/werkruimte/WerkruimteStart.tsx");

  it("toont de onderdelen via de indeling; de kop van het eigen vak staat vast bovenaan", () => {
    expect(src).toContain('const zichtbaar = zichtbareSecties("werkruimte-start", await getPaginaIndeling("werkruimte-start"));');
    expect(src).toContain("const marge = werkruimteMarges(zichtbaar);");
    expect(src).toContain("      {vak.kop}\n      {zichtbaar.map((id) => (\n        <Fragment key={id}>{onderdelen[id]}</Fragment>\n      ))}");
    const tabel = src.slice(src.indexOf("const onderdelen: Record<string, ReactNode> = {"), src.indexOf("      {vak.kop}"));
    for (const id of OUD) expect(tabel, id).toContain(`    ${id}: `);
  });

  it("alle drie de vakken leveren kop, cijfers en tegels, en er staat geen vaste ruimte meer in", () => {
    for (const f of ["rijschoolVak", "horecaVak", "websiteVak"]) expect(src, f).toContain(`await ${f}(`);
    expect(src.match(/^ {4}kop,\n {4}cijfers,\n {4}tegels: \($/gm) ?? []).toHaveLength(3);
    expect(src.match(/kl\(marge\.cijfers, "grid grid-cols-1 gap-4 /g) ?? []).toHaveLength(3);
    expect(src.match(/<div className=\{kl\(marge\.onderdelen\)\}>/g) ?? []).toHaveLength(3);
    expect(src).not.toContain('className="mt-6');
    // nog niet aangezet: alleen de ene stap, als kop
    expect(src.match(/^ {6}kop: \(\n {8}<Opzetten$/gm) ?? []).toHaveLength(3);
  });

  it("de stappen van horeca horen bij de kop en blijven dus staan", () => {
    const horeca = src.slice(src.indexOf("async function horecaVak("), src.indexOf("async function websiteVak("));
    expect(horeca.indexOf("<OnboardingProgress")).toBeLessThan(horeca.indexOf("const cijfers = ("));
    expect(horeca.indexOf("<OnboardingProgress")).toBeGreaterThan(horeca.indexOf("const kop = ("));
  });

  it("het blok over personeel krijgt zijn ruimte mee, in beide vormen", () => {
    expect(src).toContain("marge={marge.personeel} />");
    expect(src).toContain('<section className={kl(marge, "flex flex-col gap-3 ');
    expect(src).toContain("<div className={kl(marge)}>");
  });
});
