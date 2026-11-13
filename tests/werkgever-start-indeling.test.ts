import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VASTE_PAGINAS, zichtbareSecties } from "@/lib/ontwerp/vaste-paginas";
import { kl, startMarges } from "@/lib/werkgever/start-marges";

// Het startscherm van de werkgevers-app indelen (Site-ontwerper, tabblad Pagina's, 13 nov): de onderdelen onder de kop
// verslepen en verbergen. Zonder eigen indeling is het scherm precies zoals het was, ook de tussenruimte.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const OUD = ["cijfers", "volgers", "beoordelingen", "werk", "berichten", "facturen"];

describe("de standaard is het oude scherm", () => {
  it("dezelfde onderdelen, dezelfde volgorde en dezelfde ruimte erboven", () => {
    expect(VASTE_PAGINAS["werkgever-start"].secties.map((s) => s.id)).toEqual(OUD);
    expect(zichtbareSecties("werkgever-start", null)).toEqual(OUD);
    expect(startMarges(OUD)).toEqual({ cijfers: "", volgers: "mt-4", beoordelingen: "mt-8", werk: "mt-8", berichten: "mt-6", facturen: "mt-6" });
    // ook als er nu niets te tonen is in een onderdeel
    expect(startMarges(OUD, { volgers: true, berichten: true }).werk).toBe("mt-8");
  });

  it("de klassen komen er precies zo uit als ze in het scherm stonden", () => {
    const m = startMarges(OUD);
    expect(kl(m.cijfers, "grid gap-4 sm:grid-cols-2 lg:grid-cols-4")).toBe("grid gap-4 sm:grid-cols-2 lg:grid-cols-4");
    expect(kl(m.volgers, "flex flex-wrap")).toBe("mt-4 flex flex-wrap");
    expect(kl(m.werk, "grid gap-6 lg:grid-cols-2")).toBe("mt-8 grid gap-6 lg:grid-cols-2");
    expect(kl(m.beoordelingen)).toBe("mt-8");
    expect(kl(m.berichten)).toBe("mt-6");
    expect(kl(m.facturen)).toBe("mt-6");
  });
});

describe("een eigen indeling", () => {
  it("het bovenste onderdeel sluit aan, de rest krijgt dezelfde ruimte", () => {
    const m = startMarges(["facturen", "cijfers", "werk"]);
    expect(m.facturen).toBe("");
    expect(m.cijfers).toBe("mt-6");
    expect(m.werk).toBe("mt-6");
    expect(kl(m.facturen)).toBeUndefined();
    expect(kl(m.cijfers, "grid")).toBe("mt-6 grid");
  });

  it("een onderdeel dat nu niets toont telt niet als bovenste", () => {
    const m = startMarges(["volgers", "berichten", "werk", "cijfers", "beoordelingen", "facturen"], { volgers: true, berichten: true, beoordelingen: false });
    expect(m.werk).toBe("");
    expect(m.cijfers).toBe("mt-6");
    // geen sleutel uit het prototype
    expect(startMarges(["facturen", "cijfers"], { constructor: true } as Record<string, boolean>).facturen).toBe("");
  });

  it("alleen verbergen is ook een eigen indeling", () => {
    const m = startMarges(["cijfers", "werk", "facturen"]);
    expect(m.cijfers).toBe("");
    expect(m.werk).toBe("mt-6");
  });
});

describe("het scherm", () => {
  const src = bron("app/werkgever/page.tsx");

  it("toont de onderdelen via de indeling, alleen buiten de startmodus", () => {
    expect(src).toContain("      {!startModus &&\n        zichtbaar.map((id) => (\n          <Fragment key={id}>{onderdelen[id]}</Fragment>\n        ))}");
    expect(src).toContain("const marge = startMarges(zichtbaar, { volgers: followers === 0, beoordelingen: pendingReviews.length === 0, berichten: threads.length === 0 });");
  });

  it("elk onderdeel gebruikt zijn eigen ruimte; er staat geen vaste ruimte meer in de onderdelen", () => {
    for (const id of OUD) expect(src, id).toContain(`kl(marge.${id}`);
    const tabel = src.slice(src.indexOf("const onderdelen: Record<string, ReactNode> = {"), src.indexOf("  return (\n    <>"));
    expect(tabel).not.toMatch(/<div className="mt-\d/);
    // de onderdelen die soms leeg zijn, tonen dan niets
    for (const v of ["followers > 0 ? (", "pendingReviews.length > 0 ? (", "threads.length > 0 ? ("]) expect(tabel).toContain(v);
    expect(tabel.match(/^ {6}\) : null$/gm) ?? []).toHaveLength(3);
  });

  it("de kop, de stappen en de melding over verificatie blijven vast bovenaan", () => {
    const vast = src.slice(src.indexOf("  return (\n    <>"), src.indexOf("zichtbaar.map("));
    for (const v of ["<WelcomeBack", "<EmployerOnboardingWizard", "<PageHeader", "<OnboardingProgress"]) expect(vast).toContain(v);
  });

  it("de regels voor de ruimte zijn puur", () => {
    expect(bron("lib/werkgever/start-marges.ts").match(/^import .*$/gm)).toEqual(['import { VASTE_PAGINAS, type VastePaginaId } from "@/lib/ontwerp/vaste-paginas";']);
  });
});
