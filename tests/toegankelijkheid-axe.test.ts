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

  // de reparaties in de shop (kleurbolletjes, logo) zijn met de webshop op 22 nov 2026 weggehaald

  it("het prijslabel op de klussenkaart staat niet als donkere tekst op goud zonder donkere regel", () => {
    // contrastmeting werker-app 13 nov: text-ink werd in het donker bijna wit op bg-money-bright (1,5:1). Sinds 20 nov
    // (de kaart van YoungOnes) staat het tarief in de voet als gewone tekst, zonder gouden label op de foto; de regels in
    // globals.css blijven voor de andere plekken met zo'n label.
    const kaart = lees("components/app/ShiftCard.tsx");
    expect(kaart).not.toMatch(/bg-money-bright[^"]*text-ink/);
    expect(kaart).toMatch(/font-display text-lg font-bold text-ink">\{moneyExact\(shift\.hourlyRateCents\)\}/);
    const css = lees("app/globals.css");
    expect(css).toContain('.app-scope[data-theme="dark"] .bg-money-bright.text-ink,');
    expect(css).toContain('.app-scope[data-theme="dark"] .bg-money-bright .text-ink { color: #0C0E12 !important; }');
  });
});
