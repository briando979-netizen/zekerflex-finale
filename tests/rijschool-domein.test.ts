import { describe, expect, it } from "vitest";
import { BEWIJS_PAD, rijschoolPad, robotsVoor } from "@/lib/rijschool/domein-pad";

describe("rijschoolPad (eigen domein)", () => {
  const p = (pad: string) => rijschoolPad("jansen", pad);

  it("zet korte paden om naar de rijschool", () => {
    expect(p("/")).toBe("/rijschool/jansen");
    expect(p("/proefles")).toBe("/rijschool/jansen/proefles");
    expect(p("/leerling")).toBe("/rijschool/jansen/leerling");
    expect(p("/instructeur")).toBe("/rijschool/jansen/instructeur");
  });

  it("laat lange paden, eigen API, Next-bestanden en gedeelde bestanden staan", () => {
    expect(p("/rijschool/jansen/inloggen")).toBe("/rijschool/jansen/inloggen");
    expect(p("/api/rijschool/site/jansen/leerling")).toBe("/api/rijschool/site/jansen/leerling");
    expect(p("/_next/static/chunks/a.js")).toBe("/_next/static/chunks/a.js");
    expect(p("/fonts/x.woff2")).toBe("/fonts/x.woff2");
    expect(p("/api/kaart/zoek")).toBe("/api/kaart/zoek");
    expect(p("/kaart-data/nl.pmtiles")).toBe("/kaart-data/nl.pmtiles");
    expect(p("/favicon.ico")).toBe("/favicon.ico");
  });

  it("de rest van ZekerFlex en andere rijscholen zijn er niet", () => {
    expect(p("/api/rijschool/site/anders/leerling")).toBeNull();
    expect(p("/api/rijschool/beheer")).toBeNull();
    expect(p("/api/admin/users")).toBeNull();
    expect(p("/rijschool/anders")).toBeNull();
    expect(p("/sw.js")).toBeNull();
    // /werkgever wordt een pad binnen de rijschool, dat niet bestaat (404 van de rijschool)
    expect(p("/werkgever")).toBe("/rijschool/jansen/werkgever");
  });

  it("de https-controle krijgt het bewijs van de rijschool", () => {
    expect(p(BEWIJS_PAD)).toBe("/api/rijschool/domein/bewijs");
  });

  it("robots.txt volgt of de site online staat", () => {
    expect(p("/robots.txt")).toBe("/rijschool/jansen/robots.txt");
    expect(robotsVoor(true)).toContain("Allow: /");
    expect(robotsVoor(false)).toContain("Disallow: /");
  });
});
