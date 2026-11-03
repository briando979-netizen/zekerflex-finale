import { describe, expect, it } from "vitest";
import { NIEUWS_FOTOS, alineas, maakSlug, uniekeSlug, zichtbaar } from "@/lib/voorstel/nieuws-regels";

describe("nieuwsberichten", () => {
  it("maakt een nette slug, ook met accenten en tekens", () => {
    expect(maakSlug("Nieuwe kever-rally: 3 routes & meer!")).toBe("nieuwe-kever-rally-3-routes-en-meer");
    expect(maakSlug("Après-ski in Twente")).toBe("apres-ski-in-twente");
    expect(maakSlug("!!!")).toBe("bericht");
    expect(maakSlug("a".repeat(100)).length).toBeLessThanOrEqual(70);
  });

  it("houdt slugs uniek", () => {
    expect(uniekeSlug("open-dag", [])).toBe("open-dag");
    expect(uniekeSlug("open-dag", ["open-dag", "open-dag-2"])).toBe("open-dag-3");
  });

  it("splitst tekst in alinea's op lege regels", () => {
    expect(alineas("Eerste.\r\n\r\nTweede\nregel.\n\n\n  ")).toEqual(["Eerste.", "Tweede\nregel."]);
  });

  it("toont alleen gepubliceerde berichten waarvan de datum bereikt is", () => {
    expect(zichtbaar({ gepubliceerd: true, datum: "2026-11-03" }, "2026-11-03")).toBe(true);
    expect(zichtbaar({ gepubliceerd: true, datum: "2026-11-10" }, "2026-11-03")).toBe(false);
    expect(zichtbaar({ gepubliceerd: false, datum: "2026-11-01" }, "2026-11-03")).toBe(false);
  });

  it("biedt alleen hun eigen foto's aan, zonder dubbele", () => {
    expect(NIEUWS_FOTOS.length).toBeGreaterThan(5);
    expect(NIEUWS_FOTOS.every((f) => f.pad.startsWith("/voorstel/schwarzwald/"))).toBe(true);
    expect(new Set(NIEUWS_FOTOS.map((f) => f.pad)).size).toBe(NIEUWS_FOTOS.length);
  });
});
