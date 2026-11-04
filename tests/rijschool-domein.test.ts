import { describe, expect, it } from "vitest";
import { BEWIJS_PAD, naarEigenDomein, rijschoolLinksIn, rijschoolPad, robotsVoor } from "@/lib/rijschool/domein-pad";

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

describe("links in mails naar het eigen domein", () => {
  const basis = "https://zekerflex.com";
  const tekst = [
    "Kies je wachtwoord: https://zekerflex.com/rijschool/jansen/inloggen?uitnodiging=abc",
    "Pakketten: https://zekerflex.com/rijschool/jansen#pakketten",
    "Home: https://zekerflex.com/rijschool/jansen",
    "Andere school: https://zekerflex.com/rijschool/jansen-zwolle/leerling",
    "ZekerFlex zelf: https://zekerflex.com/werkgever",
  ].join("\n");

  it("vindt de rijscholen waarnaar gelinkt wordt, elk één keer", () => {
    expect(rijschoolLinksIn(tekst, basis).sort()).toEqual(["jansen", "jansen-zwolle"]);
    expect(rijschoolLinksIn("geen links", basis)).toEqual([]);
  });

  it("zet alleen de links van rijscholen met een actief domein om", () => {
    const uit = naarEigenDomein(tekst, basis, new Map([["jansen", "https://rijschooljansen.nl"]]));
    expect(uit).toContain("https://rijschooljansen.nl/inloggen?uitnodiging=abc");
    expect(uit).toContain("https://rijschooljansen.nl/#pakketten");
    expect(uit).toContain("Home: https://rijschooljansen.nl/");
    // jansen-zwolle is een andere rijschool zonder eigen domein
    expect(uit).toContain("https://zekerflex.com/rijschool/jansen-zwolle/leerling");
    expect(uit).toContain("https://zekerflex.com/werkgever");
  });

  it("zonder actieve domeinen blijft de tekst gelijk; ook in HTML (href) werkt het", () => {
    expect(naarEigenDomein(tekst, basis, new Map())).toBe(tekst);
    const html = '<a href="https://zekerflex.com/rijschool/jansen/leerling">Open</a>';
    expect(naarEigenDomein(html, basis, new Map([["jansen", "https://rijschooljansen.nl"]]))).toBe('<a href="https://rijschooljansen.nl/leerling">Open</a>');
  });
});
