import { describe, expect, it } from "vitest";
import { LEGE_BALK, balkActief, balkId, normalizeBalk } from "@/lib/ontwerp/balk";

describe("aankondigingsbalk (Site-ontwerper)", () => {
  it("standaard uit; zonder tekst kan hij niet aan", () => {
    expect(balkActief(LEGE_BALK, "2026-11-04")).toBe(false);
    expect(normalizeBalk({ aan: true, tekst: "   " }).aan).toBe(false);
    expect(normalizeBalk(null)).toEqual(LEGE_BALK);
  });

  it("onveilige link en ongeldige kleur of datum vallen weg", () => {
    const b = normalizeBalk({ aan: true, tekst: " Nieuw:   kassa ", link: "javascript:alert(1)", linkTekst: "Klik", kleur: "paars", vanaf: "morgen", tot: "2026-12-31" });
    expect(b).toMatchObject({ aan: true, tekst: "Nieuw: kassa", link: "", linkTekst: "", kleur: "merk", vanaf: "", tot: "2026-12-31", sluitbaar: true });
    expect(normalizeBalk({ aan: true, tekst: "x", link: "/aanbod", linkTekst: "Bekijk", kleur: "goud", sluitbaar: false })).toMatchObject({ link: "/aanbod", linkTekst: "Bekijk", kleur: "goud", sluitbaar: false });
  });

  it("alleen tussen vanaf en tot (Nederlandse dagen, tot en met)", () => {
    const b = normalizeBalk({ aan: true, tekst: "Actie", vanaf: "2026-11-10", tot: "2026-11-20" });
    expect(balkActief(b, "2026-11-09")).toBe(false);
    expect(balkActief(b, "2026-11-10")).toBe(true);
    expect(balkActief(b, "2026-11-20")).toBe(true);
    expect(balkActief(b, "2026-11-21")).toBe(false);
  });

  it("weggeklikt geldt voor déze tekst: een nieuwe tekst krijgt een andere vingerafdruk", () => {
    const a = normalizeBalk({ aan: true, tekst: "Actie A" });
    const b = normalizeBalk({ aan: true, tekst: "Actie B" });
    expect(balkId(a)).toBe(balkId(normalizeBalk({ aan: true, tekst: "Actie A", kleur: "donker" })));
    expect(balkId(a)).not.toBe(balkId(b));
    expect(balkId(a)).toMatch(/^[a-z0-9]+$/);
  });
});
