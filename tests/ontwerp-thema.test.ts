import { describe, expect, it } from "vitest";
import { STANDAARD_THEMA, STIJLEN, contrastChecks, normalizeThema, themaCss, zelfdeThema } from "@/lib/ontwerp/thema";

describe("normalizeThema", () => {
  it("maakt van rommel een geldig thema", () => {
    const t = normalizeThema({ primair: "rood", accent: "#abcdef", koppen: "comic-sans", hoeken: "rond", tekstgrootte: 500, breedte: "1200" });
    expect(t.primair).toBe(STANDAARD_THEMA.primair);
    expect(t.accent).toBe("#ABCDEF");
    expect(t.koppen).toBe(STANDAARD_THEMA.koppen);
    expect(t.hoeken).toBe("rond");
    expect(t.tekstgrootte).toBe(115);
    expect(t.breedte).toBe(1200);
  });
  it("niets of null wordt het standaardthema", () => {
    expect(zelfdeThema(normalizeThema(null), STANDAARD_THEMA)).toBe(true);
    expect(zelfdeThema(normalizeThema("x"), STANDAARD_THEMA)).toBe(true);
  });
  it("laat geen CSS binnen via een waarde", () => {
    const t = normalizeThema({ primair: "#000000;}body{display:none", koppen: "x;}*{color:red" });
    expect(themaCss(t, { alles: true })).not.toContain("display:none");
    expect(themaCss(t, { alles: true })).not.toContain("color:red");
  });
});

describe("themaCss", () => {
  it("het standaardthema voegt niets toe: de site blijft exact zoals hij was", () => {
    expect(themaCss(STANDAARD_THEMA)).toBeNull();
  });
  it("alleen wat afwijkt komt erbij", () => {
    const css = themaCss({ ...STANDAARD_THEMA, knoppen: "recht" })!;
    expect(css).toContain(".zf-site .btn");
    expect(css).toContain("border-radius:0.25rem");
    expect(css).not.toContain("--brand-500-rgb");
    expect(css).not.toContain("font-family");
  });
  it("een andere hoofdkleur geeft alle tinten en een passende hero", () => {
    const css = themaCss({ ...STANDAARD_THEMA, primair: "#1D4E89" })!;
    expect(css).toContain("--brand-500-rgb:29 78 137");
    expect(css).toContain("--brand-50-rgb:");
    expect(css).toContain(".hero-ink{");
  });
  it("met alles: true schrijft het voorbeeld ook de standaardwaarden uit", () => {
    const css = themaCss(STANDAARD_THEMA, { alles: true })!;
    expect(css).toContain("--brand-500-rgb:14 92 74");
    expect(css).toContain("border-radius:9999px");
    expect(css).toContain("--font-display:");
    expect(css).toContain(".zf-site .shadow-card{--tw-shadow:");
  });
  it("vormen en lettertypes gelden alleen op de openbare site", () => {
    const css = themaCss({ ...STANDAARD_THEMA, hoeken: "recht", koppen: "georgia", breedte: 1300, tekstgrootte: 105 })!;
    for (const regel of css.split("\n").filter((r) => !r.startsWith(":root") && !r.startsWith("@font-face"))) expect(regel).toMatch(/\.zf-site|\.hero-ink/);
  });
  it("een eigen lettertype laadt alleen als het gekozen is", () => {
    const css = themaCss({ ...STANDAARD_THEMA, koppen: "playfair-display", tekst: "inter" })!;
    expect(css).toContain('@font-face{font-family:"Playfair Display"');
    expect(css).toContain("/fonts/inter-latin.");
    expect(css).not.toContain("montserrat");
    expect(themaCss({ ...STANDAARD_THEMA, koppen: "georgia" })).not.toContain("@font-face");
  });
  it("elk eigen lettertypebestand bestaat in public/fonts", async () => {
    const { existsSync } = await import("node:fs");
    const { LETTERTYPES } = await import("@/lib/ontwerp/thema");
    for (const lt of Object.values(LETTERTYPES) as { bestand?: string }[]) {
      if (lt.bestand) expect(existsSync(`public/fonts/${lt.bestand}`)).toBe(true);
    }
  });
});

describe("contrastChecks", () => {
  it("de ZekerFlex-standaard is overal leesbaar", () => {
    expect(contrastChecks(STANDAARD_THEMA).every((c) => c.ok)).toBe(true);
  });
  it("een lichte hoofdkleur met witte tekst wordt gemeld", () => {
    const c = contrastChecks({ ...STANDAARD_THEMA, primair: "#FFE066" });
    expect(c.find((x) => x.label.startsWith("Witte tekst op knoppen"))?.ok).toBe(false);
  });
});

describe("kant-en-klare stijlen", () => {
  it("zijn geldig en hebben een unieke naam", () => {
    for (const s of STIJLEN) expect(zelfdeThema(normalizeThema(s.thema), s.thema)).toBe(true);
    expect(new Set(STIJLEN.map((s) => s.id)).size).toBe(STIJLEN.length);
  });
  it("houden knoppen en tekst leesbaar", () => {
    for (const s of STIJLEN) {
      const knop = contrastChecks(s.thema).find((c) => c.label.startsWith("Witte tekst op knoppen"))!;
      expect({ stijl: s.naam, ok: knop.ok }).toEqual({ stijl: s.naam, ok: true });
    }
  });
});
