import { describe, expect, it } from "vitest";
import { assetLink, bouwManifest, functieafbeeldingSvg, icoonSvg, isPakketnaam, versieNaam, voorgesteldePakketnaam } from "@/lib/rijschool/app/twa";

describe("pakketnaam van de rijschool-app", () => {
  it("neemt het eigen domein uit het e-mailadres", () => {
    expect(voorgesteldePakketnaam({ slug: "jansen", email: "info@rijschool-jansen.nl" })).toBe("nl.rijschool_jansen.app");
  });

  it("valt bij gratis mail terug op zekerflex", () => {
    expect(voorgesteldePakketnaam({ slug: "rijschool-de-weg", email: "dewegrijles@gmail.com" })).toBe("nl.zekerflex.rijschool.rijschool_de_weg");
    expect(voorgesteldePakketnaam({ slug: "x", email: "" })).toBe("nl.zekerflex.rijschool.x");
  });

  it("maakt van cijfers en Java-woorden een geldige naam", () => {
    expect(voorgesteldePakketnaam({ slug: "123-rij", email: "a@123rij.nl" })).toBe("nl.r123rij.app");
    expect(voorgesteldePakketnaam({ slug: "new", email: "a@new.nl" })).toBe("nl.new_app.app");
  });

  it("keurt ongeldige namen af", () => {
    expect(isPakketnaam("nl.rijschool.app")).toBe(true);
    expect(isPakketnaam("rijschool")).toBe(false);
    expect(isPakketnaam("Nl.Rijschool")).toBe(false);
    expect(isPakketnaam("nl.1rijschool")).toBe(false);
    expect(isPakketnaam("nl.class.app")).toBe(false);
    expect(isPakketnaam("com.example.app")).toBe(false);
    expect(isPakketnaam("nl.rij-school")).toBe(false);
  });
});

describe("wat de Android-bouwer krijgt", () => {
  it("opent de app van de rijschool op zekerflex.com", () => {
    const m = bouwManifest({ slug: "jansen", kleur: "#123456" }, { pakketnaam: "nl.jansen.app", appNaam: "Rijschool Jansen" }, "zekerflex.com", 3);
    expect(m).toMatchObject({ host: "zekerflex.com", startUrl: "/rijschool/jansen/app?bron=android", scope: "/rijschool/jansen/", versie: 3, versieNaam: "1.0.3", kleur: "#123456" });
    expect(versieNaam(12)).toBe("1.0.12");
  });

  it("valt terug op de standaardkleur bij een rare kleur", () => {
    expect(bouwManifest({ slug: "a", kleur: "rood" }, { pakketnaam: "nl.a.app", appNaam: "A" }, "zekerflex.com", 1).kleur).toBe("#1D4E89");
  });
});

describe("iconen zonder tekst", () => {
  it("gebruikt de kleuren van de rijschool en geen lettertypes", () => {
    const svg = icoonSvg("#AA0000", "#00BB00");
    expect(svg).toContain('fill="#AA0000"');
    expect(svg).toContain('fill="#00BB00"');
    expect(svg).not.toContain("<text");
    expect(functieafbeeldingSvg("#AA0000", "#00BB00")).toContain('width="1024" height="500"');
  });

  it("laat geen eigen invoer in de SVG", () => {
    expect(icoonSvg('"/><script>', "#00BB00")).not.toContain("script");
  });
});

describe("Digital Asset Links", () => {
  const v = "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89";
  it("neemt alleen geldige vingerafdrukken, zonder dubbele", () => {
    expect(assetLink("nl.jansen.app", [v, v, null, "kapot"])?.target.sha256_cert_fingerprints).toEqual([v]);
  });
  it("laat een app zonder vingerafdruk of met ongeldige pakketnaam weg", () => {
    expect(assetLink("nl.jansen.app", [null])).toBeNull();
    expect(assetLink("kapot", [v])).toBeNull();
  });
});
