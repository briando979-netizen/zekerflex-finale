import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// De cookiemelding ligt vast onderaan. Zonder ruimte eronder lag de laatste knop van een pagina onder de melding,
// ook helemaal naar beneden gescrold (12 nov, gemeten op 390×844: "Organisatie aanmelden" op /register op
// 665–705 px, de melding van 605 tot 844 px). Nu: een lege ruimte ter hoogte van de melding zolang hij open is.

const bron = readFileSync("components/marketing/CookieConsent.tsx", "utf8").replace(/\r\n/g, "\n");

describe("ruimte onder de cookiemelding", () => {
  it("meet de echte hoogte met een ResizeObserver en ruimt die netjes op", () => {
    expect(bron).toContain("new ResizeObserver(meet)");
    expect(bron).toContain("return () => ro.disconnect();");
    expect(bron).toMatch(/setRuimte\(Math\.ceil\(el\.getBoundingClientRect\(\)\.height\)\)/);
  });

  it("de ruimte staat alleen in beeld zolang de melding open is, met de gemeten hoogte en niet op /os", () => {
    const vroegTerug = bron.indexOf("if (!visible) return null;");
    const ruimte = bron.indexOf("data-cookie-ruimte");
    expect(vroegTerug).toBeGreaterThan(-1);
    expect(ruimte).toBeGreaterThan(vroegTerug);
    expect(bron).toContain("{!opOs && <div aria-hidden data-cookie-ruimte style={{ height: ruimte }} />}");
  });

  it("de hooks staan vóór de vroege return (anders breekt React bij wegklikken)", () => {
    expect(bron.indexOf("const [ruimte, setRuimte] = useState(0);")).toBeLessThan(bron.indexOf("if (!visible) return null;"));
    expect(bron.indexOf("}, [visible]);")).toBeLessThan(bron.indexOf("if (!visible) return null;"));
  });
});
