import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// axe-core op de 10 meest bezochte openbare pagina's (12–13 nov, 390 en 1280): 0 kritiek, 0 contrast, 0 ontbrekende
// labels of alt-teksten, 0 dubbele id's. Wel: de cookiemelding stond buiten elke landmark (op elke pagina), inloggen en
// aanmelden hadden geen <main>, en in de shop een aria-label op een <p> en een logo-link waarvan de naam niet bij de
// zichtbare tekst paste. Deze test houdt de reparaties vast.

const lees = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

describe("toegankelijkheid (axe)", () => {
  it("de cookiemelding is een benoemde regio, in elke taal", () => {
    const bron = lees("components/marketing/CookieConsent.tsx");
    expect(bron).toContain('role="region" aria-label={c.label}');
    for (const taal of ["nl", "en", "pl", "ro", "uk"]) expect(bron, taal).toMatch(new RegExp(`\\n  ${taal}: \\{ label: "[^"]+"`));
  });

  it("inloggen en aanmelden hebben een <main>", () => {
    const bron = lees("components/auth/AuthShell.tsx");
    expect(bron).toContain('<main className="grid min-h-screen');
    expect(bron).toContain("</main>");
  });

  it("de kleurbolletjes in de shop zijn één benoemd plaatje", () => {
    expect(lees("components/marketing/ShopProductCard.tsx")).toMatch(/<p role="img" [^>]*aria-label=\{/);
  });

  it("de zichtbare tekst van het shop-logo past bij zijn naam (ZekerFlex shop)", () => {
    const bron = lees("components/marketing/ShopChrome.tsx");
    expect(bron).toContain('aria-label="ZekerFlex Shop"');
    expect(bron).toContain('ZekerFlex{" "}<span');
  });
});
