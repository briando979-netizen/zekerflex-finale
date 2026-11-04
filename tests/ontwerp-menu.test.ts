import { describe, expect, it } from "vitest";
import { MAX_KOLOMMEN, MAX_LINKS, STANDAARD_VOETTEKST, normalizeVoettekst } from "@/lib/ontwerp/menu";
import { STANDAARD_THEMA, themaCss } from "@/lib/ontwerp/thema";

describe("normalizeVoettekst", () => {
  it("de standaard-voettekst blijft precies gelijk (alle links zijn geldig)", () => {
    expect(normalizeVoettekst(STANDAARD_VOETTEKST)).toEqual(STANDAARD_VOETTEKST);
  });
  it("links zonder tekst of met een onveilig adres vallen weg", () => {
    const v = normalizeVoettekst({
      slogan: "Hallo",
      kolommen: [{ titel: "Meer", links: [{ label: "Goed", href: "/p/actie" }, { label: "Kwaad", href: "javascript:alert(1)" }, { label: "", href: "/prijzen" }, { label: "Extern", href: "https://example.com" }] }],
    });
    expect(v.kolommen[0]?.links).toEqual([
      { label: "Goed", href: "/p/actie" },
      { label: "Extern", href: "https://example.com" },
    ]);
  });
  it("hoogstens 4 kolommen en 25 links per kolom; lege kolommen weg", () => {
    const veel = { titel: "K", links: Array.from({ length: 40 }, (_, i) => ({ label: `L${i}`, href: `/p/${i}` })) };
    const v = normalizeVoettekst({ kolommen: [{ titel: "", links: [] }, ...Array.from({ length: 6 }, () => veel)] });
    expect(v.kolommen.length).toBe(MAX_KOLOMMEN - 1);
    expect(v.kolommen[0]?.links.length).toBe(MAX_LINKS);
  });
  it("geen slogan meegegeven = de standaardzin; een lege slogan mag", () => {
    expect(normalizeVoettekst({ kolommen: [] }).slogan).toBe(STANDAARD_VOETTEKST.slogan);
    expect(normalizeVoettekst({ slogan: "", kolommen: [] }).slogan).toBe("");
  });
});

describe("inktkleur voor de bovenbalk", () => {
  it("een andere donkere kleur zet --zf-inkt-rgb, de standaard niet", () => {
    expect(themaCss({ ...STANDAARD_THEMA, inkt: "#0B1624" })).toContain("--zf-inkt-rgb:11 22 36");
    expect(themaCss(STANDAARD_THEMA)).toBeNull();
    expect(themaCss(STANDAARD_THEMA, { alles: true })).toContain("--zf-inkt-rgb:12 14 18");
  });
});
